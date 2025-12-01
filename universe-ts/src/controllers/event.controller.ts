import { StatusCodes } from 'http-status-codes';
import { Request, Response, NextFunction } from 'express';
import Event from '../models/event.model';
import Club from '../models/club.model';
import User from '../models/user.model';
import Ticket from '../models/ticket.model';
import schedule from 'node-schedule';
import PDFDocument from 'pdfkit';
import { sendMail, scheduleNotification } from './utils.controller';
import mongoose from 'mongoose';
import { formatDateToMonthDay } from './common.controller';

//MiddleWare
const isAuthorized = async (id: string, role: string, belongsTo: { type: string; id: string }) => {
  if (role === 'admin') {
    return true;
  } else {
    if (belongsTo.type === 'Club') {
      const club = await Club.findById(belongsTo.id, { adminId: 1 });
      if (club) {
        const adminIds = club.adminId;
        if (adminIds.includes(id)) {
          return true;
        }
      }
    }
    return false;
  }
};

/**
 * @desc    Create a new event
 * @route   POST /
 * @access  Admin
 */
const createEvent = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'admin') {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: 'You are not authorized to create an event.' });
    }

    const event = await Event.create({ ...req.body });

    return res.status(StatusCodes.CREATED).json({ success: true, event });
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Failed to create event', error: error });
  }
};

/**
 * @desc Get all events with optional status filter and pagination
 * @route GET /event/all
 * @access User, Admin
 */
const getAllEvents = async (req: Request, res: Response) => {
  try {
    const { status, batch, batchSize } = req.query;
    const batchNumber = parseInt(batch as string, 10) || 0;
    const batchSizeNumber = parseInt(batchSize as string, 10) || 10; // Default batch size

    const projectionFields = {
      bookedBy: 0,
      amtPaid: 0,
      amtPaidTo: 0,
      ticketSellingDays: 0,
      cumulativeRevenue: 0,
      courseAnalytics: 0,
      faq: 0,
    };

    let query = {};
    if (status) {
      query = { status };
    }

    const totalCount = await Event.countDocuments(query);
    const skip = Math.max(0, totalCount - batchNumber * batchSizeNumber);
    const limit = skip < batchSizeNumber ? skip : batchSizeNumber;

    const events = await Event.find(query, projectionFields)
      .skip(skip)
      .limit(limit)
      .populate({ path: 'itineraries', options: { default: [] } })
      .lean(); // Optimize by returning plain JS objects

    return res.status(StatusCodes.OK).json({
      success: true,
      totalCount,
      batchNumber,
      batchSize: batchSizeNumber,
      events: events.reverse(),
    });
  } catch (error) {
    console.error('Error fetching events:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Internal server error',
      error: error,
    });
  }
};

/**
 * @desc Change the status of an event
 * @route PATCH /event/status
 * @access Admin
 */
const changeEventStatus = async (req: Request, res: Response) => {
  if (req.user.role !== 'admin') {
    return res.status(StatusCodes.FORBIDDEN).json({ message: 'Unauthorized access.' });
  }

  const { status, id } = req.query;
  if (!id || !status || typeof status !== 'string') {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid request parameters.' });
  }

  if (!['pending', 'featured', 'past and unclear', 'past and clear'].includes(status)) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid status value.' });
  }

  try {
    const event = await Event.findById(id, {
      bookedBy: 0,
      amtPaid: 0,
      amtPaidTo: 0,
      ticketSellingDays: 0,
      cumulativeRevenue: 0,
      courseAnalytics: 0,
      faq: 0,
    });

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event not found.' });
    }

    event.status = status as 'pending' | 'featured' | 'past and unclear' | 'past and clear';
    await event.save();

    if (status === 'featured') {
      scheduleEventFeedUpdate(event, req.user.id);
    }

    return res.status(StatusCodes.OK).json({ message: 'Event status updated successfully.' });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Schedules an event feed update and notifications
 */
const scheduleEventFeedUpdate = async (event: any, adminId: string) => {
  const triggerTime = new Date(Date.now() + 3000); // 3 seconds later

  schedule.scheduleJob(`eventFeed_${adminId}_${Date.now()}`, triggerTime, async () => {
    try {
      const users = await User.find({}, { eventFeed: 1 });

      const updatedUsers = users.map((user) => {
        if (!user.eventFeed) {
          user.eventFeed = [];
        }
        user.eventFeed.unshift({
          ...event.toObject(),
          header: 'You might find this event interesting',
        });
        return user.save();
      });

      await Promise.all(updatedUsers);

      if (event.belongsTo?.type === 'Club') {
        await sendClubNotifications(event);
      }
    } catch (error) {
      console.error('Error scheduling event feed update:', error);
    }
  });
};

/**
 * @desc Sends email and notifications to club members
 */
const sendClubNotifications = async (event: any) => {
  const club = await Club.findById(event.belongsTo.id, {
    name: 1,
    mainAdmin: 1,
    members: 1,
    secondaryImg: 1,
  });
  if (!club) return;

  const admin = await User.findById(club.mainAdmin, { name: 1, email: 1 });
  if (!admin) return;

  const subject = `Confirmation - ${event.name}`;
  const intro = [
    'Congratulations! We at Macbease have exciting news.',
    `The event "${event.name}" in your club "${club.name}" is now featured on Macbease! Tickets are live.`,
  ];
  const outro = 'We wish you a successful event. Macbease is always here to support you.';
  const recipients = [admin.email, event.eventManagerMail].filter(Boolean);

  await sendMail(`Team ${club.name}`, intro, outro, subject, recipients);

  // Notify club members
  const members = await User.find(
    { _id: { $in: club.members } },
    { pushToken: 1, name: 1, email: 1, unreadNotice: 1 },
  );

  const updateMembers = members.map(async (member) => {
    const notice = {
      value: `Tickets for "${event.name}" by "${club.name}" are live. Grab yours now!`,
      img1: club.secondaryImg || null,
      img2: event.url || null,
      key: 'event',
      action: 'club',
      params: {
        name: club.name,
        secondaryImg: club.secondaryImg || undefined,
        id: club._id as mongoose.Types.ObjectId,
      },
      time: new Date(),
      uid: `${Date.now()}/${event._id}/ticketLive`,
    };

    if (!member.unreadNotice) {
      member.unreadNotice = [];
    }
    member.unreadNotice.unshift(notice);
    await member.save();

    await sendMail(member.name, intro, 'See you at the event!', `Great update - ${event.name}`, [
      member.email,
    ]);

    if (member.pushToken) {
      scheduleNotification({
        pushToken: [member.pushToken],
        title: `Hi ${member.name}`,
        body: notice.value,
      });
    }
  });

  await Promise.all(updateMembers);
};

/**
 * @desc    Create a new club event and submit for review
 * @route   POST /event/club
 * @access  User, Admin
 */
const addClubEvent = async (req: Request, res: Response): Promise<Response> => {
  try {
    // Validate input
    if (!req.body.title || !req.body.date || !req.body.location) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        msg: 'Missing required fields: title, date, location.',
      });
    }

    // Create event with pending status
    const event = await Event.create({ ...req.body, status: 'pending' });

    return res.status(StatusCodes.CREATED).json({
      msg: 'Event was successfully posted for featuring. Decision pending.',
      eventId: event._id,
    });
  } catch (error) {
    console.error('Error creating event:', error);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: 'Event creation failed. Please try again later.',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Controller 5
/**
 * @desc Delete an event by ID
 * @route DELETE /event
 * @access Admin
 */
const deleteEvent = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { eventId } = req.params;

    // Validate eventId
    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Event ID is required.' });
    }

    // Ensure user authorization
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({ error: 'Unauthorized to delete the event.' });
    }

    // Find and delete event
    const deletedEvent = await Event.findByIdAndDelete(eventId).lean();

    if (!deletedEvent) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: 'Event not found or already deleted.' });
    }

    return res.status(StatusCodes.OK).json({ message: 'Event deleted successfully', deletedEvent });
  } catch (error) {
    console.error('Error deleting event:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error', error });
  }
};

/**
 * @desc Get tickets bought by the user
 * @route GET /event/tickets
 * @access User
 */
const getTicketsBought = async (req: Request, res: Response) => {
  try {
    const { key } = req.query;

    // Fetch only the ticket IDs, minimizing the document size fetched
    const user = await User.findById(req.user.id).select('ticketsBought').lean();
    if (!user || !user.ticketsBought?.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'No tickets found for the user.' });
    }

    const ticketsBought = user.ticketsBought;
    const limit = key === 'all' ? ticketsBought.length : Math.min(6, ticketsBought.length);

    // Fetch all tickets in one query
    const tickets = await Ticket.find({ _id: { $in: ticketsBought.slice(0, limit) } }).lean();
    if (!tickets.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Tickets not found.' });
    }

    const eventIds = tickets.map((ticket) => ticket.eventId);

    // Fetch all relevant events in one query
    const events = await Event.find(
      { _id: { $in: eventIds } },
      {
        bookedBy: 0,
        cumulativeRevenue: 0,
        ticketSellingDays: 0,
        courseAnalytics: 0,
        faq: 0,
        description: 0,
      },
    ).lean();

    if (!events.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Events for tickets not found.' });
    }

    // Map events by their ID for quick access
    const eventMap = new Map(events.map((event) => [event._id.toString(), event]));

    // Combine ticket and event data
    const result = tickets.map((ticket) => ({
      ...eventMap.get(ticket.eventId.toString()),
      pricePaid: ticket.amtPaid,
      ticketData: ticket,
      status: ticket.status,
    }));

    return res.status(StatusCodes.OK).json({ tickets: result, total: result.length });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Get analytics for an event
 * @route GET /event/analytics
 * @access Admin, User
 */
const getEventAnalytics = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.query;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid event ID.' });
    }

    // Fetch only required fields for analytics
    const event = await Event.findById(eventId)
      .select('cumulativeRevenue ticketSellingDays courseAnalytics bookedBy')
      .lean();

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event not found.' });
    }

    // Prepare graphData for revenue trends
    const graphData = (event.cumulativeRevenue || []).map((value, index) => ({
      value,
      dataPointText: `₹${value}`,
      label: formatDateToMonthDay(event.ticketSellingDays?.[index] || ''),
    }));

    // Process courseAnalytics (top 3 sorted)
    const courseAnalyticsData = (event.courseAnalytics || [])
      .sort((a, b) => b.count - a.count)
      .slice(0, 3)
      .map(({ count, course }) => ({ value: count, text: course }));

    const ticketSold = Array.isArray(event.bookedBy) ? event.bookedBy.length : 0;

    return res.status(StatusCodes.OK).json({
      graphData,
      courseAnalyticsData,
      ticketSold,
    });
  } catch (error) {
    console.error('Error fetching event analytics:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Get custom analytics for an event
 * @route GET /event/analytics/custom
 * @access User, Admin
 */
const getCustomAnalytics = async (req: Request, res: Response) => {
  try {
    const { mode, eventId } = req.query;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid event ID.' });
    }

    const event = await Event.findById(eventId).select('bookedBy').lean();
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event not found.' });
    }

    const bookedBy = event.bookedBy || [];
    if (Array.isArray(bookedBy) && bookedBy.length === 0) {
      return res.status(StatusCodes.OK).json({ message: 'No tickets booked for this event.' });
    }

    // Fetch all tickets in one go
    const tickets = await Ticket.find({ _id: { $in: bookedBy } })
      .select('boughtBy')
      .lean();

    const userIds = tickets.map((ticket) => ticket.boughtBy);
    if (userIds.length === 0) {
      return res.status(StatusCodes.OK).json({ message: 'No user data available.' });
    }

    // Fetch all users in one go
    const users = await User.find({ _id: { $in: userIds } })
      .select('level passoutYear')
      .lean();

    if (mode === 'Level') {
      const levelCount = users.reduce(
        (acc, user) => {
          if (user.level) {
            acc[user.level as keyof typeof acc] = (acc[user.level as keyof typeof acc] || 0) + 1;
          }
          return acc;
        },
        { UG: 0, PG: 0, PhD: 0 },
      );

      const pieData = [
        { value: levelCount.UG, text: 'UnderGraduate' },
        { value: levelCount.PG, text: 'PostGraduate' },
        { value: levelCount.PhD, text: 'Research Scholar' },
      ];

      return res.status(StatusCodes.OK).json(pieData);
    }

    if (mode === 'Year') {
      const currentYear = new Date().getFullYear();
      const yearArr = [
        { text: currentYear, value: 0 },
        { text: currentYear + 1, value: 0 },
        { text: currentYear + 2, value: 0 },
        { text: currentYear + 3, value: 0 },
      ];

      users.forEach((user) => {
        const index = typeof user.passoutYear === 'number' ? user.passoutYear - currentYear : -1;
        if (index >= 0 && index < yearArr.length) {
          yearArr[index].value += 1;
        }
      });

      return res.status(StatusCodes.OK).json(yearArr);
    }

    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid mode provided.' });
  } catch (error) {
    console.error('Error fetching custom analytics:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Add or update predefined FAQ for an event
 * @route PATCH /predefined-ques
 * @access User, Admin
 */
const addPredefinedQues = async (req: Request, res: Response) => {
  try {
    const { ques, ans, eventId, faqId } = req.body;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid or missing event ID.' });
    }

    if (!ques || !ans) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: 'Question and answer are required.' });
    }

    // Fetch event with necessary fields
    const event = await Event.findById(eventId).select('belongsTo faq').lean();
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event not found.' });
    }

    // Authorization check
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo as { type: string; id: string },
    );
    if (!authorized) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Not authorized to modify FAQs.' });
    }

    // Generate new FAQ entry
    const newFaq = {
      id: crypto.randomUUID(),
      ques,
      ans,
      predefined: true,
    };

    // Update FAQs and set predefined flag if faqId exists
    const updatedFaqs = [
      newFaq,
      ...(event.faq || []).map((faq) =>
        faq.id === faqId ? { ...faq, setAsPredefined: true } : faq,
      ),
    ];

    // Update event in a single DB call
    await Event.findByIdAndUpdate(eventId, { faq: updatedFaqs }, { new: true });

    return res.status(StatusCodes.OK).json({ message: 'FAQ updated successfully.', faq: newFaq });
  } catch (error) {
    console.error('Error updating FAQ:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Remove a predefined FAQ from an event
 * @route DELETE /event/predefined-ques
 * @access User, Admin
 */
const removePredefinedQues = async (req: Request, res: Response) => {
  try {
    const { faqId, eventId, ques } = req.body;

    if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid or missing event ID.' });
    }

    if (!faqId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'FAQ ID is required.' });
    }

    // Fetch event with necessary fields
    const event = await Event.findById(eventId).select('belongsTo faq').lean();
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event not found.' });
    }

    // Authorization check
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo as { type: string; id: string },
    );
    if (!authorized) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Not authorized to modify FAQs.' });
    }

    // Update FAQs: set predefined flag to false or remove matching FAQ
    const updatedFaqs = event.faq
      ?.map((faq) => (faq.id === faqId ? { ...faq, setAsPredefined: false } : faq))
      .filter((faq) => !(faq.ques === ques && faq.id !== faqId));

    // Update event in a single DB call
    await Event.findByIdAndUpdate(eventId, { faq: updatedFaqs }, { new: true });

    return res
      .status(StatusCodes.OK)
      .json({ message: 'Predefined question removed successfully.' });
  } catch (error) {
    console.error('Error removing predefined FAQ:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Ask a question related to an event and notify the event manager
 * @route POST /event/ask-question
 * @access User
 */
const askQuestion = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.params;
    const { ques } = req.body;
    const userId = req.user?.id;

    if (!eventId || !ques) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Event ID and question are required.' });
    }

    const [event, user] = await Promise.all([
      Event.findById(eventId).select('faq eventManagerMail name'),
      User.findById(userId).select('name image _id pushToken'),
    ]);

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Event not found.' });
    }
    if (!user) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found.' });
    }

    const dataPoint = {
      id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
      ques,
      seekerDetail: {
        name: user.name,
        image: user.image,
        id: user._id,
        pushToken: user.pushToken,
      },
      predefined: false,
    };

    event.faq.push(dataPoint);
    await event.save();

    schedule.scheduleJob(
      `questionAsked_${Date.now()}_${userId}`,
      new Date(Date.now() + 3000),
      async () => {
        try {
          if (!event.eventManagerMail) return;

          await sendMail(
            'Event Manager',
            [
              `A new question has been asked for the event: ${event.name}. Please review and respond.`,
              ques,
            ],
            'This email contains confidential information. If you did not request this, please ignore it.',
            `Question asked regarding ${event.name}`,
            [event.eventManagerMail],
          );
        } catch (error) {
          console.error('Error sending email notification:', error);
        }
      },
    );

    return res
      .status(StatusCodes.OK)
      .json({ message: 'Question submitted successfully.', data: dataPoint });
  } catch (error) {
    console.error('Error in askQuestion:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error. Please try again later.', error });
  }
};

/**
 * @desc Answer a question related to an event and notify the question seeker
 * @route PATCH /event/answer-the-question
 * @access Event Manager, Admin
 */
const answerTheQuestion = async (req: Request, res: Response) => {
  try {
    const { eventId, faqId } = req.params;
    const { ans } = req.body;
    const userId = req.user?.id;

    if (!eventId || !faqId || !ans) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Event ID, FAQ ID, and answer are required.' });
    }

    const [event, user] = await Promise.all([
      Event.findById(eventId).select('faq eventManagerMail name belongsTo url'),
      User.findById(userId).select('name image _id pushToken'),
    ]);

    if (!event) return res.status(StatusCodes.NOT_FOUND).json({ error: 'Event not found.' });
    if (!user) return res.status(StatusCodes.NOT_FOUND).json({ error: 'User not found.' });

    const authorized = await isAuthorized(
      userId,
      req.user.role,
      event.belongsTo as { type: string; id: string },
    );
    if (!authorized)
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ error: 'Not authorized to answer this question.' });

    const faqIndex = event.faq.findIndex((item) => item.id === faqId);
    if (faqIndex === -1) return res.status(StatusCodes.NOT_FOUND).json({ error: 'FAQ not found.' });

    const oldData = event.faq[faqIndex];
    const seeker = await User.findById(oldData.seekerDetail.id).select(
      'email name pushToken unreadNotice image',
    );
    if (!seeker) return res.status(StatusCodes.NOT_FOUND).json({ error: 'Seeker not found.' });

    event.faq[faqIndex] = {
      ...oldData,
      ans,
      answererDetail: {
        name: user.name,
        image: user.image,
        pushToken: user.pushToken,
        position: 'Event Manager',
      },
    };
    await event.save();

    if (event.belongsTo.type === 'Club') {
      const notice = {
        value: `Your query regarding ${event.name} has been answered.`,
        img1: seeker.image,
        img2: event.url || null,
        key: 'event',
        action: 'club',
        params: {
          id: event.belongsTo.id,
          name: event.belongsTo.name,
          secondaryImg: event.belongsTo.img,
          deepNavigation: { action: 'eventFaq', params: { data: event } },
        },
        time: new Date(),
        uid: `${Date.now()}/${faqId}/${userId}`,
      };
      seeker.unreadNotice = [notice, ...(seeker.unreadNotice || [])];
      await seeker.save();
    }

    schedule.scheduleJob(
      `answered_${Date.now()}_${userId}`,
      new Date(Date.now() + 3000),
      async () => {
        try {
          if (seeker.email) {
            await sendMail(
              seeker.name,
              [
                `The question you raised on the FAQ portal for ${event.name} has been answered. Hope it helps!`,
                'Thank you for contacting us.',
              ],
              'This email contains confidential information. If you did not request this, please ignore it.',
              `Answer posted regarding ${event.name}`,
              [seeker.email],
            );
          }
          if (seeker.pushToken) {
            scheduleNotification({
              pushToken: [seeker.pushToken],
              title: `Query regarding ${event.name}`,
              body: 'Your question has been answered. Visit console now.',
            });
          }
        } catch (err) {
          console.error('Scheduled job error:', err);
        }
      },
    );

    return res
      .status(StatusCodes.OK)
      .json({ message: 'Answer submitted successfully.', data: event.faq[faqIndex] });
  } catch (error) {
    console.error('Error in answerTheQuestion:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error. Please try again later.', error });
  }
};

/**
 * @desc Fetches FAQs for a given event, separating predefined and general questions.
 * @route GET /event/faq
 * @access User, Admin
 */
const getFaq = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.query;
    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Event ID is required.' });
    }

    const event = await Event.findById(eventId, { faq: 1, belongsTo: 1 });
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event not found.' });
    }

    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo as { type: string; id: string },
    );
    const predefined = event.faq.filter((faq) => faq.predefined);
    const generalQuestion = event.faq.slice(predefined.length);

    return res.status(StatusCodes.OK).json({ predefined, generalQuestion, authorized });
  } catch (error) {
    console.error('Error fetching FAQs:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Updates the status of featured events to 'past and unclear' if expired.
 * @route PATCH /event/job/status
 * @access Admin
 */
const changeStatusJob = async (req: Request, res: Response) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'Access denied.' });
    }

    const featuredEvents = await Event.find({ status: 'featured' });
    if (!featuredEvents.length) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'No featured events found.' });
    }

    const currentTime = new Date();
    const updates = featuredEvents
      .filter((event) => event.eventDate && new Date(event.eventDate) < currentTime)
      .map((event) => {
        event.status = 'past and unclear';
        return event.save();
      });

    await Promise.all(updates);

    const jobSchedule = '0 0 * * *';
    schedule.cancelJob('expireEvent');
    schedule.scheduleJob('expireEvent', jobSchedule, async () => {
      const expiringEvents = await Event.find({ status: 'featured' });
      const updatePromises = expiringEvents
        .filter((event) => event.eventDate && new Date(event.eventDate) < new Date())
        .map((event) => {
          event.status = 'past and unclear';
          return event.save();
        });
      await Promise.all(updatePromises);
    });

    return res.status(StatusCodes.OK).json({ message: 'All event statuses updated successfully.' });
  } catch (error) {
    console.error('Error in changeStatusJob:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Fetches tickets for featured and expired events.
 * @route GET /event/tickets
 * @access User, Admin
 */
const getTickets = async (req: Request, res: Response) => {
  try {
    const events = await Event.find(
      {
        status: { $in: ['featured', 'past and unclear'] },
        ticketAvailable: true,
      },
      {
        courseAnalytics: 0,
        cumulativeRevenue: 0,
        ticketSellingDays: 0,
        amtPaid: 0,
        amtPaidTo: 0,
      },
    ).populate({ path: 'itineraries', options: { default: [] } });

    const featuredEvents = events.filter((event) => event.status === 'featured');
    const expiredEvents = events.filter((event) => event.status === 'past and unclear').slice(0, 2);

    return res.status(StatusCodes.OK).json({ featuredEvents, expiredEvents });
  } catch (error) {
    console.error('Error in getTickets:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Generate a ticket list PDF dynamically
 * @route get /event/generate-ticket-listPdf
 * @access User, Admin
 */
const generateTicketListPdf = async (req: Request, res: Response) => {
  try {
    // Extract user data from request body or database
    const { name = 'Unknown', email = 'Not Provided', age = 'N/A' } = req.body;

    // Set response headers for PDF
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'attachment; filename="ticket-list.pdf"',
    });

    const doc = new PDFDocument();
    doc.pipe(res);

    // Add PDF content
    doc.fontSize(24).text('Dynamic PDF Generated with Node.js', { align: 'center' });
    doc.moveDown();
    doc.fontSize(16).text(`Name: ${name}`);
    doc.fontSize(16).text(`Email: ${email}`);
    doc.fontSize(16).text(`Age: ${age}`);

    // Finalize and send the PDF
    doc.end();
  } catch (error) {
    console.error('Error generating PDF:', error);

    // Handle errors gracefully
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: 'Failed to generate the PDF. Please try again later.',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * @desc Get paginated reviews for an event
 * @route GET /event/reviews
 * @access User, Admin
 */
const getReviews = async (req: Request, res: Response) => {
  try {
    const { eventId, batch = '1', batchSize = '10' } = req.query;

    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Event ID is required' });
    }

    const batchNumber = parseInt(batch as string, 10);
    const batchSizeNumber = parseInt(batchSize as string, 10);

    if (isNaN(batchNumber) || isNaN(batchSizeNumber) || batchNumber < 1 || batchSizeNumber < 1) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid batch or batchSize' });
    }

    // Fetch paginated reviews with user info in a single query using aggregation
    const reviews = await Ticket.aggregate([
      { $match: { eventId, reviewMsg: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      { $skip: (batchNumber - 1) * batchSizeNumber },
      { $limit: batchSizeNumber },
      {
        $lookup: {
          from: 'users',
          localField: 'boughtBy',
          foreignField: '_id',
          as: 'userInfo',
        },
      },
      { $unwind: '$userInfo' },
      {
        $project: {
          reviewMsg: 1,
          reviewStars: 1,
          reviewUrls: 1,
          reviewLiked: 1,
          'userInfo.name': 1,
          'userInfo.reg': 1,
          'userInfo.image': 1,
          'userInfo.course': 1,
          'userInfo.pushToken': 1,
          'userInfo.interests': 1,
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(reviews);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc Check ticket availability for an event
 * @route GET /event/ticket-availability
 * @access User, Admin
 */
const checkTicketAvailability = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { eventId } = req.query;
    if (!eventId || typeof eventId !== 'string') {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: 'Event ID is required and must be a string.' });
    }

    // Fetch only required fields with a single optimized query
    const event = await Event.findById(eventId)
      .select('bookedBy ticketTypes itineraries')
      .populate('itineraries');

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Event not found.' });
    }

    // Initialize ticket sales count
    const ticketTypesSales: Record<string, number> = event.ticketTypes.reduce(
      (acc, ticket) => {
        acc[ticket.type.trim()] = 0;
        return acc;
      },
      {} as Record<string, number>,
    );

    if (Array.isArray(event.bookedBy) && event.bookedBy.length > 0) {
      // Aggregate ticket sales in a single query
      const ticketCounts = await Ticket.aggregate([
        { $match: { _id: { $in: event.bookedBy } } },
        { $group: { _id: '$type', count: { $sum: 1 } } },
      ]);

      // Map ticket sales count to the respective types
      ticketCounts.forEach(({ _id, count }) => {
        const type = _id.trim();
        if (ticketTypesSales.hasOwnProperty(type)) {
          ticketTypesSales[type] = count;
        }
      });
    }

    return res.status(StatusCodes.OK).json({
      ticketTypesSales,
      itineraries: event.itineraries || [],
    });
  } catch (error) {
    console.error('Error checking ticket availability:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal Server Error', error });
  }
};

/**
 * @desc Get live attendance for an event
 * @route GET /event/live-attendance
 * @access User, Admin
 */
const checkLiveAttendance = async (req: Request, res: Response) => {
  try {
    const { eventId } = req.query;
    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Event ID is required.' });
    }

    // Fetch event with only required fields
    const event = await Event.findById(eventId).select('bookedBy ticketTypes').lean();
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Event not found.' });
    }

    // Initialize ticket type structure
    const ticketTypesEntrance: Record<string, any[]> = {};
    event.ticketTypes.forEach((ticket) => {
      if (ticket.type) {
        ticketTypesEntrance[ticket.type.trim()] = [];
      }
    });

    if (!Array.isArray(event.bookedBy) || !event.bookedBy.length) {
      return res.status(StatusCodes.OK).json(ticketTypesEntrance); // No attendees
    }

    // Fetch redeemed tickets along with user details in one query
    const tickets = await Ticket.find({
      _id: { $in: event.bookedBy },
      status: 'redeemed',
    })
      .select('type boughtBy')
      .populate('boughtBy', 'name image reg') // Populate user details
      .lean();

    tickets.forEach(({ type, boughtBy }) => {
      if (boughtBy && ticketTypesEntrance[type.trim()]) {
        ticketTypesEntrance[type.trim()].push(boughtBy);
      }
    });

    return res.status(StatusCodes.OK).json(ticketTypesEntrance);
  } catch (error) {
    console.error('Error fetching live attendance:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Something went wrong.', error });
  }
};

/**
 * @desc  Ask users to submit event reviews
 * @route PATCH /event/ask-for-review-submission
 * @access User, Admin
 */
const askForReviewSubmission = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid event ID' });
    }

    // Fetch event details
    const event = await Event.findById(eventId).select('bookedBy name url');
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Event not found' });
    }

    // Get users who haven't reviewed the event
    const notReviewedUsers = await Ticket.aggregate([
      { $match: { _id: { $in: event.bookedBy }, reviewMsg: null } },
      {
        $lookup: {
          from: 'users',
          localField: 'boughtBy',
          foreignField: '_id',
          pipeline: [{ $project: { email: 1, pushToken: 1, name: 1, image: 1 } }],
          as: 'userDetails',
        },
      },
      { $unwind: '$userDetails' },
      {
        $project: {
          userId: '$userDetails._id',
          pushToken: '$userDetails.pushToken',
          email: '$userDetails.email',
          name: '$userDetails.name',
          image: '$userDetails.image',
        },
      },
    ]);

    if (notReviewedUsers.length === 0) {
      return res
        .status(StatusCodes.NO_CONTENT)
        .json({ message: 'All users have reviewed the event.' });
    }

    // Prepare and push unread notifications
    const notice = {
      value: `Share your experience at ${event.name} with us.`,
      img1: event.url,
      img2: event.url,
      key: 'event',
      action: 'yourTickets',
      params: {},
      time: new Date(),
      uid: `${Date.now()}/${event.name}/${req.user?.id}`,
    };
    const userIds = notReviewedUsers.map((user) => user.userId);
    await User.updateMany({ _id: { $in: userIds } }, { $push: { unreadNotice: notice } });

    // Schedule push notifications and emails
    const scheduleTime = new Date(Date.now() + 3 * 1000);
    schedule.scheduleJob(`review_${eventId}`, scheduleTime, async () => {
      await Promise.all(
        notReviewedUsers.map(async (user) => {
          scheduleNotification({
            pushToken: [user.pushToken],
            title: `Hi ${user.name}`,
            body: `How was your experience at ${event.name}? Please review it on your tickets console.`,
          });

          const intro = [
            `How was your experience at ${event.name}?`,
            `Please review it in your tickets section.`,
          ];
          const outro = 'We look forward to seeing you at the next event.';
          const subject = `Review event ${event.name}`;
          const destination = [user.email];

          try {
            const { ses, params } = await sendMail(user.name, intro, outro, subject, destination);
            ses.sendEmail(params, (err) => {
              if (err) console.error(`Email failed for ${user.email}:`, err);
            });
          } catch (emailError) {
            console.error(`Failed to send email to ${user.email}:`, emailError);
          }
        }),
      );
    });

    return res.status(StatusCodes.OK).json({ message: 'Review reminders scheduled successfully.' });
  } catch (error) {
    console.error(error);
    next(error);
  }
};

/**
 * @desc  Fetch paginated list of tickets bought for an event
 * @route GET /event/tickets/all
 * @access User, Admin
 */
const getAllTicketsBought = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { eventId } = req.params;
    const batch = parseInt(req.query.batch as string, 10) || 1;
    const batchSize = parseInt(req.query.batchSize as string, 10) || 10;
    const skip = (batch - 1) * batchSize;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid event ID' });
    }

    // Fetch booked tickets with pagination
    const event = await Event.findById(eventId).select('bookedBy');
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Event not found' });
    }

    const bookedTickets = Array.isArray(event.bookedBy)
      ? event.bookedBy
          .map((id: mongoose.Types.ObjectId) => id.toString())
          .slice(skip, skip + batchSize)
      : [];
    if (bookedTickets.length === 0) {
      return res
        .status(StatusCodes.NO_CONTENT)
        .json({ message: 'No tickets booked for this event.' });
    }

    // Fetch ticket details along with user metadata
    const tickets = await Ticket.aggregate([
      { $match: { _id: { $in: bookedTickets } } },
      {
        $lookup: {
          from: 'users',
          localField: 'boughtBy',
          foreignField: '_id',
          as: 'userMetaData',
        },
      },
      { $unwind: '$userMetaData' },
      {
        $project: {
          _id: 1,
          boughtBy: 1,
          eventId: 1,
          paymentId: 1,
          amtPaid: 1,
          status: 1,
          generatedAt: 1,
          type: 1,
          'userMetaData.name': 1,
          'userMetaData.course': 1,
          'userMetaData.reg': 1,
          'userMetaData.email': 1,
          'userMetaData.pushToken': 1,
          'userMetaData.image': 1,
        },
      },
    ]);

    return res
      .status(StatusCodes.OK)
      .json({
        tickets,
        batch,
        batchSize,
        total: Array.isArray(event.bookedBy) ? event.bookedBy.map((id) => id.toString()).length : 0,
      });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    next(error);
  }
};

/**
 * @desc Get latest 10 events
 * @route GET /
 * @access Public
 */
const getEvents = async (req: Request, res: Response): Promise<Response> => {
  try {
    const events = await Event.find({}, 'name belongsTo url eventDate startTime endTime place')
      .sort({ eventDate: -1 })
      .limit(10)
      .lean();

    return res.status(StatusCodes.OK).json({ count: events.length, events });
  } catch (error) {
    console.error('Error fetching events:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching events.', error });
  }
};

/**
 * @desc Check event status for a user
 * @route GET /event/status
 * @access User
 */
const checkEventStatus = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { eventId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(eventId as string)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Invalid event ID.' });
    }

    const [event, user] = await Promise.all([
      Event.findById(eventId, 'status ticketAvailable belongsTo').lean(),
      User.findById(req.user.id, 'ticketsBought').lean(),
    ]);

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event not found.' });
    }

    // if (!user || !user.ticketsBought || user.ticketsBought.length === 0) {
    //   return res.status(StatusCodes.OK).json({
    //     status: event.status,
    //     ticketAvailable: event.ticketAvailable,
    //     alreadyBooked: false,
    //     ticketType: null,
    //   });
    // }

    const matchedTicket = user?.ticketsBought?.length
      ? await Ticket.findOne({ _id: { $in: user.ticketsBought }, eventId }).lean()
      : null;

    const club = await Club.findById(event.belongsTo, 'adminId').lean();

    return res.status(StatusCodes.OK).json({
      status: event.status,
      ticketAvailable: event.ticketAvailable,
      alreadyBooked: !!matchedTicket,
      ticketType: matchedTicket?.type || null,
      ticketId: matchedTicket?._id || null,
      hasAdminAccess: club?.adminId.includes(req.user.id) || false,
    });
  } catch (error) {
    console.error('Error fetching event status:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching event status.', error });
  }
};

/**
 * @desc Get event details by ID
 * @route GET /event/:eventId
 * @access Public
 */
const getEventById = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { eventId } = req.params; // Extract eventId from request params
    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ error: 'Invalid event ID.' });
    }

    const event = await Event.findById(eventId)
      .populate({
        path: 'itineraries',
        options: { default: [] }, // Ensures an empty array if no itineraries exist
      })
      .lean();

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({ error: 'Event not found.' });
    }

    return res.status(StatusCodes.OK).json(event);
  } catch (error) {
    console.error('Error fetching event:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'An error occurred while fetching the event.', error });
  }
};

/**
 * @desc Clear event feed for all users
 * @route DELETE /event/feed
 * @access Admin
 */
const clearEventFeed = async (req: Request, res: Response) => {
  try {
    await User.updateMany({}, { $set: { eventFeed: [] } });
    return res.status(StatusCodes.OK).json({ message: 'Event feed cleared for all users' });
  } catch (error) {
    console.error('Error clearing event feed:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error', error });
  }
};

export {
  createEvent,
  deleteEvent,
  getAllEvents,
  changeEventStatus,
  addClubEvent,
  getTicketsBought,
  getEventAnalytics,
  getCustomAnalytics,
  addPredefinedQues,
  removePredefinedQues,
  askQuestion,
  answerTheQuestion,
  getFaq,
  changeStatusJob,
  getTickets,
  generateTicketListPdf,
  getReviews,
  checkTicketAvailability,
  checkLiveAttendance,
  askForReviewSubmission,
  getAllTicketsBought,
  getEvents,
  checkEventStatus,
  getEventById,
  clearEventFeed,
};
