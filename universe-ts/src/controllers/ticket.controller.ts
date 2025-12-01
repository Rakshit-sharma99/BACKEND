import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import Ticket from '../models/ticket.model';
import Event from '../models/event.model';
import User from '../models/user.model';
import Club from '../models/club.model';
import { sendMail, scheduleNotification } from './utils.controller';
import schedule from 'node-schedule';
import mongoose from 'mongoose';

// middleware
const checkAuthorization = async (ticketId: string, role: string, id: string) => {
  const ticket = await Ticket.findById(ticketId);
  const eventId = ticket?.eventId;
  const event = await Event.findById(eventId, { belongsTo: 1 });
  const belongsTo = event?.belongsTo;
  if (role === 'admin') {
    return true;
  } else {
    if (belongsTo?.type === 'Club') {
      const club = await Club.findById(belongsTo.id, { adminId: 1 });
      const adminIds = club?.adminId;
      if (adminIds?.includes(id)) {
        return true;
      }
    }
    return false;
  }
};

/**
 * @desc Updates event statistics based on ticket sales data.
 * @param {Object} params - Function parameters
 * @param {string} params.eventId - ID of the event
 * @param {number} params.amtPaid - Amount paid for the ticket
 * @param {string} params.userField - User's field of study/interest
 * @access Internal Helper
 */
const updateEventStatsJob = async ({
  eventId,
  amtPaid,
  userField,
}: {
  eventId: string;
  amtPaid: number;
  userField: string;
}) => {
  try {
    const event = await Event.findById(eventId, {
      ticketSellingDays: 1,
      cumulativeRevenue: 1,
      courseAnalytics: 1,
    });

    if (!event) {
      console.error('Event not found for stats update:', eventId);
      return;
    }

    // Ensure arrays exist before pushing values
    if (!event.ticketSellingDays) event.ticketSellingDays = [];
    if (!event.cumulativeRevenue) event.cumulativeRevenue = [];

    const formattedDate = new Date().toISOString().split('T')[0];

    // Update ticket selling days and revenue
    const dayIndex = event?.ticketSellingDays?.indexOf(formattedDate);
    if (dayIndex === -1) {
      event.ticketSellingDays.push(formattedDate);
      event.cumulativeRevenue.push(amtPaid);
    } else {
      event.cumulativeRevenue[dayIndex] =
        (Number(event.cumulativeRevenue[dayIndex]) || 0) + amtPaid;
    }

    // Ensure courseAnalytics exists before modifying it
    if (!event.courseAnalytics) event.courseAnalytics = [];

    // Update course analytics
    const courseEntry = event?.courseAnalytics?.find((entry) => entry.course === userField);
    if (courseEntry) {
      courseEntry.count += 1;
    } else {
      event?.courseAnalytics?.push({ course: userField, count: 1 });
    }

    await event.save();

    console.log(`Event stats updated successfully for event: ${eventId}`);
  } catch (error) {
    console.error('Error updating event stats:', error);
  }
};

/**
 * @desc Generate a ticket for an event after successful payment
 * @route POST /ticket
 * @access User
 */
const generateTicket = async (req: Request, res: Response): Promise<Response> => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { eventId, paymentId, amtPaid, type } = req.body;
    if (!eventId || !paymentId || !amtPaid || !type) {
      return res.status(StatusCodes.BAD_REQUEST).json({ message: 'All fields are required.' });
    }

    // Create ticket
    const ticket = await Ticket.create(
      [
        {
          eventId,
          paymentId,
          amtPaid,
          boughtBy: req.user.id,
          generatedAt: new Date(),
          type,
        },
      ],
      { session },
    );

    // Fetch event and user details in a single query with required fields only
    const [event, user] = await Promise.all([
      Event.findById(eventId, { name: 1, eventManagerMail: 1, url: 1, authorizedPerson: 1 }).lean(),
      User.findById(req.user.id, {
        name: 1,
        field: 1,
        email: 1,
        image: 1,
        pushToken: 1,
        ticketsBought: 1,
        unreadNotice: 1,
      }).lean(),
    ]);

    if (!event || !user) {
      await session.abortTransaction();
      return res.status(StatusCodes.NOT_FOUND).json({ message: 'Event or user not found.' });
    }

    // Update user and event data atomically
    await Promise.all([
      User.updateOne(
        { _id: user._id },
        {
          $push: {
            ticketsBought: ticket[0]._id,
            unreadNotice: {
              value: `You have purchased the ticket for ${event.name}`,
              img1: user.image,
              img2: event.url,
              key: 'event',
              action: 'yourTickets',
              params: {},
              time: new Date(),
              uid: `${new Date()}/${ticket[0]._id}/${req.user.id}`,
            },
          },
        },
        { session },
      ),

      Event.updateOne({ _id: eventId }, { $push: { bookedBy: ticket[0]._id } }, { session }),
    ]);

    await session.commitTransaction();
    session.endSession();

    // Asynchronous analytics update
    updateEventStatsJob({ eventId, amtPaid, userField: user.field as string });

    // Schedule notifications & emails asynchronously
    schedule.scheduleJob(
      `ticketPurchased_${req.user.id}_${Date.now()}`,
      new Date(Date.now() + 3000),
      async () => {
        const subject = 'Macbease Ticket';
        const intro = [
          `Thank you for purchasing a ticket for ${event.name}. Your ticket is available in your Macbease account.`,
          'We will see you there.',
        ];
        const outro = `For any queries, please contact ${event.eventManagerMail} or check the event FAQ.`;

        try {
          const { ses, params } = await sendMail(user.name, intro, outro, subject, [user.email]);
          ses.sendEmail(params, (err) => {
            if (err) console.error('Email error:', err);
          });

          scheduleNotification({
            pushToken: user.pushToken ? [user.pushToken] : [],
            title: 'Ticket Purchased!',
            body: `Your ticket for ${event.name} has been added to your account.`,
          });

          if (event?.authorizedPerson?.pushToken) {
            scheduleNotification({
              pushToken: [event.authorizedPerson.pushToken],
              title: 'Ticket Sold!',
              body: 'To view live statistics, visit your event console.',
            });
          }
        } catch (error) {
          console.error('Notification/Email error:', error);
        }
      },
    );

    return res
      .status(StatusCodes.OK)
      .json({ message: 'Ticket generated successfully!', ticket: ticket[0] });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    console.error('Ticket generation error:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: 'Internal server error.', error });
  }
};

/**
 * @desc Scans a ticket and marks it as redeemed if valid
 * @route PATCH /ticket/scan
 * @access User
 */
const scanTicket = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId, eventId } = req.body;

  if (!ticketId || !eventId) {
    return res.status(StatusCodes.BAD_REQUEST).json({ message: 'Missing ticketId or eventId' });
  }

  try {
    const isAuthorized = await checkAuthorization(ticketId, req.user.role || '', req.user.id || '');

    if (!isAuthorized) {
      return res.status(StatusCodes.FORBIDDEN).json({ message: 'You are not authorized.' });
    }

    // Fetch ticket and user details in parallel
    const ticket = await Ticket.findById(ticketId).lean();
    if (!ticket) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: 'Invalid ticket ID.' });
    }

    if (ticket.status !== 'active' || ticket.eventId.toString() !== eventId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ msg: 'Ticket scan unsuccessful.' });
    }

    // Mark ticket as redeemed in a transaction for consistency
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      await Ticket.updateOne({ _id: ticketId }, { $set: { status: 'redeemed' } }).session(session);
      await session.commitTransaction();
    } catch (err) {
      await session.abortTransaction();
      throw err;
    } finally {
      session.endSession();
    }

    // Fetch user and event info in parallel
    const [userInfo, eventInfo] = await Promise.all([
      User.findById(ticket.boughtBy, { name: 1, image: 1, reg: 1, pushToken: 1 }).lean(),
      Event.findById(eventId, { name: 1 }).lean(),
    ]);

    // Schedule notification if user has pushToken
    if (userInfo?.pushToken) {
      schedule.scheduleJob(`push_${userInfo._id}`, new Date(Date.now() + 3000), async () => {
        scheduleNotification({
          pushToken: userInfo.pushToken ? [userInfo.pushToken] : [],
          title: `Welcome to ${eventInfo?.name || 'the event'}`,
          body: 'Enjoy the event and Carpe Diem!',
        });
      });
    }

    return res.status(StatusCodes.OK).json({ msg: 'Ticket scan successful.', userInfo });
  } catch (error) {
    console.error('Error scanning ticket:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: 'Something went wrong.' });
  }
};

/**
 * @desc Reviews an event by updating ticket details
 * @route PATCH /ticket/review
 * @access User
 */
const reviewEvent = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId, reviewMsg, reviewUrls, reviewStars } = req.body;

  if (!ticketId || reviewStars === undefined) {
    return res.status(StatusCodes.BAD_REQUEST).json({ msg: 'Missing required fields.' });
  }

  try {
    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { $set: { reviewMsg, reviewUrls, reviewStars } },
      { new: true, runValidators: true },
    ).lean();
    if (!ticket) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: 'Ticket not found.' });
    }

    return res.status(StatusCodes.OK).json({ msg: 'Event reviewed successfully.' });
  } catch (error) {
    console.error('Error reviewing event:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: 'Something went wrong.' });
  }
};

/**
 * @desc Likes a review
 * @route PATCH /ticket/review/like
 * @access User
 */
const likeReview = async (req: Request, res: Response): Promise<Response> => {
  const { ticketId } = req.body;

  if (!ticketId) {
    return res.status(StatusCodes.BAD_REQUEST).json({ msg: 'Missing ticket ID.' });
  }

  try {
    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { $set: { reviewLiked: true } },
      { new: true },
    ).lean();

    if (!ticket) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: 'Ticket not found.' });
    }

    return res.status(StatusCodes.OK).json({ msg: 'Review successfully liked.' });
  } catch (error) {
    console.error('Error liking review:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: 'Something went wrong.' });
  }
};

/**
 * @desc Unlikes a review
 * @route PATCH /ticket/review/unlike
 * @access User
 */
const unLikeReview = async (req: Request, res: Response) => {
  const { ticketId } = req.body;

  if (!ticketId) {
    return res.status(StatusCodes.BAD_REQUEST).json({ msg: 'Missing ticket ID.' });
  }

  try {
    const ticket = await Ticket.findByIdAndUpdate(
      ticketId,
      { $set: { reviewLiked: false } },
      { new: true },
    ).lean();

    if (!ticket) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: 'Ticket not found.' });
    }

    return res.status(StatusCodes.OK).json({ msg: 'Review successfully unliked.' });
  } catch (error) {
    console.error('Error unliking review:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: 'Something went wrong.' });
  }
};

export { generateTicket, scanTicket, reviewEvent, likeReview, unLikeReview };
