const { StatusCodes } = require('http-status-codes');
const Event = require('../models/event');
const Club = require('../models/club');
const User = require('../models/user');
const Ticket = require('../models/ticket');
const schedule = require('node-schedule');
const PDFDocument = require('pdfkit');
require('dotenv').config();
const {
  sendMail,
  scheduleNotification,
  generateEmailReportHtml,
  generateTicketPDFAndUpload,
} = require('../controllers/utils');
const { default: mongoose, STATES } = require('mongoose');

//MiddleWare
const isAuthorized = async (id, role, belongsTo) => {
  if (role === 'admin') {
    return true;
  } else {
    if (belongsTo.type === 'Club') {
      const club = await Club.findById(belongsTo.id, { adminId: 1 });
      const adminIds = club.adminId;
      if (adminIds.includes(id)) {
        return true;
      }
    }
    return false;
  }
};

//Controller 1
const createEvent = async (req, res) => {
  if (req.user.role === 'admin') {
    const event = await Event.create({ ...req.body });
    return res.status(StatusCodes.CREATED).json({ event });
  } else {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send('Sorry you are not authorized to create an event.');
  }
};

//Controller 2
const getAllEvents = async (req, res) => {
  try {
    const { status, batch, batchSize } = req.query;

    if (status) {
      const events = await Event.find(
        { status },
        {
          bookedBy: 0,
          amtPaid: 0,
          amtPaidTo: 0,
          ticketSellingDays: 0,
          cumulativeRevenue: 0,
          courseAnalytics: 0,
          faq: 0,
        }
      ).populate({
        path: 'itineraries',
        options: { default: [] }, // Ensures empty array if no itineraries exist
      });

      return res.status(StatusCodes.OK).json(events);
    } else {
      const count = await Event.countDocuments();
      let startIndex = count - batch * batchSize;
      let endIndex = batchSize;

      if (startIndex < 0) {
        endIndex = batchSize - Math.abs(startIndex);
        startIndex = 0;
      }

      const events = await Event.find({})
        .skip(startIndex)
        .limit(endIndex)
        .populate({
          path: 'itineraries',
          options: { default: [] },
        });

      return res.status(StatusCodes.OK).json(events.reverse());
    }
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: 'An error occurred while fetching events.' });
  }
};

//Controller 3
const changeEventStatus = async (req, res) => {
  if (req.user.role === 'admin') {
    const { status, id } = req.query;
    try {
      let event = await Event.findById(id, {
        bookedBy: 0,
        amtPaid: 0,
        amtPaidTo: 0,
        ticketSellingDays: 0,
        cumulativeRevenue: 0,
        courseAnalytics: 0,
        faq: 0,
      });
      event.status = status;
      event.save();

      //scheduling a job to update event feed
      if (status === 'featured') {
        let threeSec = new Date(Date.now() + 1 * 3 * 1000);
        schedule.scheduleJob(
          `eventFeed_${req.user.id}_${new Date()}`,
          threeSec,
          async () => {
            //pushing event into every user's event feed
            let users = await User.find({});
            for (let i = 0; i < users.length; i++) {
              let user = users[i];
              user.eventFeed = [
                {
                  ...event._doc,
                  header: 'You might find this event interesting',
                },
                ...user.eventFeed,
              ];
              user.save();
            }
            //sending an email to the event manager and notification to all the members
            if (event.belongsTo.type === 'Club') {
              const belongsTo = event.belongsTo;
              let clubId = belongsTo.id;
              let clubDetails = await Club.findById(clubId, {
                name: 1,
                mainAdmin: 1,
                _id: 0,
                members: 1,
                secondaryImg: 1,
              });
              let userDetail = await User.findById(clubDetails.mainAdmin, {
                name: 1,
                email: 1,
                _id: 0,
              });
              const intro = [
                'Congratulations! We at Macbease are delighted to deliver you a great news.',
                `The event ${event.name} posted in your club ${clubDetails.name} has been selected to be featured on Macbease event console. Tickets are live now!`,
              ];
              const outro =
                'We wish you a great event. The team at Macbease will always be more than willing to help you.';
              const subject = `Confirmation- ${event.name}`;
              const destination = [userDetail.email, event.eventManagerMail];
              const name = `Team ${clubDetails.name}`;
              const { ses, params } = await sendMail(
                name,
                intro,
                outro,
                subject,
                destination
              );
              await ses.sendEmail(params).promise();

              //code for notification begins here
              const members = await User.find(
                {
                  _id: { $in: clubDetails.members },
                },
                { pushToken: 1, name: 1, email: 1, unreadNotice: 1 }
              );
              for (let i = 0; i < members.length; i++) {
                const member = members[i];
                const intro = [
                  'Congratulations! We at Macbease are delighted to deliver you a great news.',
                  `The event ${event.name} posted in your club ${clubDetails.name} is now featuring on Macbease. Tickets are live, go buy one for yourself!`,
                ];
                const outro = 'We will see you at the event.';
                const subject = `Great update- ${event.name}`;
                const destination = [member.email];
                const name = `${member.name}`;
                const { ses, params } = await sendMail(
                  name,
                  intro,
                  outro,
                  subject,
                  destination
                );
                const notice = {
                  value: `Tickets for ${event.name} organized by ${clubDetails.name} is live. Go and buy one!`,
                  img1: clubDetails.secondaryImg,
                  img2: event.url,
                  key: 'event',
                  action: 'club',
                  params: {
                    name: clubDetails.name,
                    secondaryImg: clubDetails.secondaryImg,
                    id: clubId,
                  },
                  time: new Date(),
                  uid: `${new Date()}/${event._id}/ticketLive`,
                };
                member.unreadNotice = [notice, ...member.unreadNotice];
                member.save();
                await ses.sendEmail(params).promise();
                scheduleNotification(
                  [member.pushToken],
                  `Hi ${member.name}`,
                  `Tickets for ${event.name} organized by ${clubDetails.name} is live. Go and buy one!`
                );
              }
            }
          }
        );
        return res
          .status(StatusCodes.OK)
          .send('Event status changed successfully.');
      } else {
        return res
          .status(StatusCodes.OK)
          .send('Event status changed successfully.');
      }
    } catch (error) {
      console.log(error);
      return res.status(StatusCodes.OK).send('Something went wrong.');
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send('You are not authorized to change the status of the event!');
  }
};

//Controller 4
const addClubEvent = async (req, res) => {
  try {
    const event = await Event.create({ ...req.body, status: 'pending' });
    return res.status(StatusCodes.CREATED).json({
      msg: 'Event was successfully posted for featuring. Decision pending.',
      eventId: event._id,
    });
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Event creation failed.');
  }
};

//Controller 5
const deleteEvent = async (req, res) => {
  if (req.user.role === 'admin') {
    const { eventId } = req.body;
    const deletedEvent = await Event.findByIdAndRemove({ _id: eventId });
    if (deletedEvent) {
      return res.status(StatusCodes.OK).json({ deletedEvent });
    }
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Was unable to find event and delete it!');
  } else {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send('You are not authorized to delete the event.');
  }
};

//Controller 7
const getTicketsBought = async (req, res) => {
  try {
    const user = await User.findById(req.user.id, {
      ticketsBought: 1,
      _id: 0,
    });

    if (!user || !user.ticketsBought.length) {
      return res.status(StatusCodes.OK).json({ arr: [], length: 0 });
    }

    const tickets = await Ticket.find({ _id: { $in: user.ticketsBought } });

    const eventIds = tickets.map((ticket) => ticket.eventId);
    const events = await Event.find(
      { _id: { $in: eventIds } },
      {
        bookedBy: 0,
        cumulativeRevenue: 0,
        ticketSellingDays: 0,
        courseAnalytics: 0,
        faq: 0,
        description: 0,
      }
    ).lean();

    const eventMap = {};
    for (const event of events) {
      eventMap[event._id] = event;
    }

    const arr = tickets
      .map((ticket) => {
        const actualEvent = eventMap[ticket.eventId];
        if (!actualEvent) return null;

        return {
          ...actualEvent,
          pricePaid: ticket.amtPaid,
          ticketData: ticket,
          status: ticket.status,
        };
      })
      .filter(Boolean); // remove nulls in case some events aren't found

    return res
      .status(StatusCodes.OK)
      .json({ arr: arr.reverse(), length: arr.length });
  } catch (error) {
    console.error('Error in getTicketsBought:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

//helper function to convert "2024-03-12" into 12 Mar
function formatDate(inputDate) {
  const dateParts = inputDate.split('-');
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]) - 1;
  const day = parseInt(dateParts[2]);
  const dateObject = new Date(year, month, day);
  const formattedDate = dateObject.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
  });
  return formattedDate;
}

//Controller 8
const getEventAnalytics = async (req, res) => {
  const { eventId } = req.query;
  try {
    const event = await Event.findById(eventId);
    let revenue = event.cumulativeRevenue;
    let dates = event.ticketSellingDays;
    let graphData = [];
    for (let i = 0; i < revenue.length; i++) {
      let obj = {
        value: revenue[i],
        dataPointText: `₹${revenue[i]}`,
        label: formatDate(dates[i]),
      };
      graphData.push(obj);
    }
    let courseAnalyticsData = [];
    let courseAnalytics = event.courseAnalytics;
    if (courseAnalytics.length < 4) {
      for (let j = 0; j < courseAnalytics.length; j++) {
        let obj = {
          value: courseAnalytics[j].count,
          text: courseAnalytics[j].course,
        };
        courseAnalyticsData.push(obj);
      }
    } else {
      for (let j = 0; j < 3; j++) {
        for (let k = j + 1; k < courseAnalytics.length; k++) {
          let first = courseAnalytics[j];
          let second = courseAnalytics[k];
          if (first.count < second.count) {
            courseAnalytics[j] = second;
            courseAnalytics[k] = first;
          }
        }
      }
      for (let l = 0; l < 3; l++) {
        let obj = {
          value: courseAnalytics[l].count,
          text: courseAnalytics[l].course,
        };
        courseAnalyticsData.push(obj);
      }
    }
    const ticketSold = event.bookedBy.length;
    const ticketTypes = event.ticketTypes.map((ticket) => ticket.type.trim());
    const ticketCounts = await Ticket.aggregate([
      { $match: { _id: { $in: event.bookedBy } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);
    const ticketTypesSales = ticketTypes.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {});
    ticketCounts.forEach(({ _id, count }) => {
      if (ticketTypesSales.hasOwnProperty(_id.trim())) {
        ticketTypesSales[_id.trim()] = count;
      }
    });
    return res.status(StatusCodes.OK).json({
      graphData,
      courseAnalyticsData,
      ticketSold,
      ticketTypesSales,
    });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 9
const getCustomAnalytics = async (req, res) => {
  const { mode, eventId } = req.query;
  try {
    const event = await Event.findById(eventId);
    const bookedBy = event.bookedBy;
    const len = bookedBy.length;
    let UG = 0;
    let PG = 0;
    let PhD = 0;
    let yearArr = [
      { text: new Date().getFullYear(), value: 0 },
      { text: new Date().getFullYear() + 1, value: 0 },
      { text: new Date().getFullYear() + 2, value: 0 },
      { text: new Date().getFullYear() + 3, value: 0 },
    ];
    for (let i = 0; i < len; i++) {
      const ticketId = bookedBy[i];
      const ticket = await Ticket.findById(ticketId, { boughtBy: 1, _id: 0 });
      const user = await User.findById(ticket.boughtBy, {
        level: 1,
        _id: 0,
        passoutYear: 1,
      });
      if (mode === 'Level') {
        if (user.level === 'UG') {
          UG = UG + 1;
        } else if (user.level === 'PG') {
          PG = PG + 1;
        } else if (user.level === 'PhD') {
          PhD = PhD + 1;
        }
      } else if (mode === 'Year') {
        const passoutYear = user.passoutYear;
        if (passoutYear !== undefined) {
          const index = passoutYear - new Date().getFullYear();
          if (index >= 0 && index < yearArr.length) {
            yearArr[index].value += 1;
          } else {
            console.warn(
              `Passout year ${passoutYear} is out of expected range.`
            );
          }
        } else {
          console.warn(`User ${user._id} has no passoutYear defined.`);
        }
      }
    }
    if (mode === 'Level') {
      const pieData = [
        { value: UG, text: 'UnderGraduate' },
        { value: PG, text: 'PostGraduate' },
        { value: PhD, text: 'Research Scholar' },
      ];
      return res.status(StatusCodes.OK).json(pieData);
    } else if (mode === 'Year') {
      return res.status(StatusCodes.OK).json(yearArr);
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 10
const addPredefinedQues = async (req, res) => {
  const { ques, ans, eventId, faqId } = req.body;
  try {
    let event = await Event.findById(eventId, { belongsTo: 1, faq: 1 });
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo
    );
    if (!ques || !ans || !authorized) {
      return res
        .status(StatusCodes.OK)
        .send('Either insufficient data or not authorized.');
    }
    const dataPoint = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
      ques,
      ans,
      predefined: true,
    };
    event.faq = [dataPoint, ...event.faq];
    if (faqId) {
      for (let i = 0; i < event.faq.length; i++) {
        if (event.faq[i].id === faqId) {
          event.faq[i] = { ...event.faq[i], setAsPredefined: true };
        }
      }
    }
    event.save();
    return res.status(StatusCodes.OK).send('Faq updated successfully.');
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 11
const removePredefinedQues = async (req, res) => {
  const { faqId, eventId, ques } = req.body;
  try {
    let event = await Event.findById(eventId, { belongsTo: 1, faq: 1 });
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo
    );
    if (!faqId || !authorized) {
      return res
        .status(StatusCodes.OK)
        .send('Either insufficient data or not authorized.');
    }
    let foundIndex;
    for (let i = 0; i < event.faq.length; i++) {
      if (event.faq[i].id === faqId) {
        event.faq[i].setAsPredefined = false;
      }
      if (event.faq[i].ques === ques && !event.faq[i].id === faqId) {
        foundIndex = i;
      }
    }
    event.faq.splice(foundIndex, 1);
    event.save();
    return res
      .status(StatusCodes.OK)
      .send('Predefined question removed successfully.');
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 12
const askQuestion = async (req, res) => {
  const { eventId, ques } = req.body;
  try {
    let event = await Event.findById(eventId, {
      faq: 1,
      eventManagerMail: 1,
      name: 1,
    });
    const user = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      _id: 1,
      pushToken: 1,
    });
    const dataPoint = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
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
    event.save();

    //scheduling a job for alerting event manager
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(
      `questionAsked_${new Date()}_${req.user.id}`,
      threeSec,
      async () => {
        //sending an email to the event manager
        const intro = [
          `We have received the following question on faq portal for ${event.name}. Could you kindly investigate and address this matter at your earliest convenience?`,
          ques,
        ];
        const outro =
          'This email contains confidential information. If you did not accept this email kindly ignore it.';
        const subject = `Question asked regarding ${event.name}`;
        const destination = [event.eventManagerMail];
        const name = 'Event Manager';
        const { ses, params } = await sendMail(
          name,
          intro,
          outro,
          subject,
          destination
        );
        await ses.sendEmail(params).promise();
      }
    );
    return res.status(StatusCodes.OK).json({ dataPoint });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 13
const answerTheQuestion = async (req, res) => {
  const { eventId, ans, faqId } = req.body;
  try {
    let event = await Event.findById(eventId);
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo
    );
    if (!ans || !authorized) {
      return res
        .status(StatusCodes.OK)
        .send('Either insufficient data or not authorized.');
    }
    const user = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      _id: 1,
      pushToken: 1,
    });
    let newDataCopy;
    let email = '';
    let name = '';
    let seeker = {
      email: '',
      name: '',
      pushToken: '',
      unreadNotice: [],
      image: '',
    };
    for (let i = 0; i < event.faq.length; i++) {
      if (event.faq[i].id === faqId) {
        const oldData = event.faq[i];
        const seekerId = oldData.seekerDetail.id;
        seeker = await User.findById(seekerId, {
          email: 1,
          name: 1,
          pushToken: 1,
          unreadNotice: 1,
          image: 1,
        });
        email = seeker.email;
        name = seeker.name;
        const newData = {
          ...oldData,
          ans,
          answererDetail: {
            name: user.name,
            image: user.image,
            pushToken: user.pushToken,
            position: 'Event Manager',
          },
        };
        newDataCopy = newData;
        event.faq[i] = newData;
        break;
      }
    }
    event.save();
    //in-app notice to user
    if (event.belongsTo.type === 'Club') {
      const params = {
        id: event.belongsTo.id,
        name: event.belongsTo.name,
        secondaryImg: event.belongsTo.img,
        deepNavigation: {
          action: 'eventFaq',
          params: {
            data: event,
          },
        },
      };
      const notice = {
        value: `You query regarding ${event.name} has been answered.`,
        img1: seeker.image,
        img2: event.url,
        key: 'event',
        action: 'club',
        params: params,
        time: new Date(),
        uid: `${new Date()}/${faqId}/${req.user.id}`,
      };
      seeker.unreadNotice = [notice, ...seeker.unreadNotice];
      seeker.save();
    }

    //scheduling a job for alerting the seeker
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(
      `answered_${new Date()}_${req.user.id}`,
      threeSec,
      async () => {
        //sending an email to the seeker
        const intro = [
          `The question you raised on faq portal for ${event.name} has been answered.Hope so it helps!`,
          `Thank you for contacting us.`,
        ];
        const outro =
          'This email contains confidential information. If you did not accept this email kindly ignore it.';
        const subject = `Answer posted regarding ${event.name}`;
        const destination = [email];
        const { ses, params } = await sendMail(
          name,
          intro,
          outro,
          subject,
          destination
        );
        ses.sendEmail(params, function (err, data) {
          if (err) {
            console.log(err, err.stack);
          }
        });
        //sending push notice to the seeker
        scheduleNotification(
          [seeker.pushToken],
          `Query regarding ${event.name}`,
          `Your question has been answered. Visit console now.`
        );
      }
    );

    return res.status(StatusCodes.OK).json({ dataPoint: newDataCopy });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 14
const getFaq = async (req, res) => {
  const { eventId } = req.query;
  try {
    let predefined = [];
    const event = await Event.findById(eventId, { faq: 1, belongsTo: 1 });
    let lastPredefinedIndex = event.faq.length;
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo
    );
    for (let i = 0; i < event.faq.length; i++) {
      const faq = event.faq[i];
      if (faq.predefined) {
        predefined.push(faq);
      } else {
        lastPredefinedIndex = i - 1;
        break;
      }
    }
    const generalQuestion = event.faq.slice(
      lastPredefinedIndex + 1,
      event.faq.length
    );
    return res
      .status(StatusCodes.OK)
      .json({ predefined, generalQuestion, authorized });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 15
const changeStatusJob = async (req, res) => {
  if (req.user.role === 'admin') {
    let featuredEvents = await Event.find({ status: 'featured' });
    for (let i = 0; i < featuredEvents.length; i++) {
      let event = featuredEvents[i];
      const time = new Date();
      const expiryTime = new Date(event.eventDate);
      const diff = expiryTime - time;
      if (diff < 0) {
        event.status = 'past and unclear';
        event.save();
      }
    }
    const jobSchedule = '0 0 * * *';
    schedule.cancelJob('expireEvent');
    schedule.scheduleJob(`expireEvent`, jobSchedule, async () => {
      let featuredEvents = await Event.find({ status: 'featured' });
      for (let i = 0; i < featuredEvents.length; i++) {
        let event = featuredEvents[i];
        const time = new Date();
        const expiryTime = new Date(event.eventDate);
        const diff = expiryTime - time;
        if (diff < 0) {
          event.status = 'past and unclear';
          event.save();
        }
      }
    });
    return res
      .status(StatusCodes.OK)
      .send('All event status configured successfully.');
  }
};

//Controller 16
const getTickets = async (req, res) => {
  try {
    const featuredEvents = await Event.find(
      {
        status: 'featured',
        ticketAvailable: true,
        eventDate: { $gte: new Date() },
      },
      {
        courseAnalytics: 0,
        cumulativeRevenue: 0,
        ticketSellingDays: 0,
        amtPaid: 0,
        amtPaidTo: 0,
      }
    ).populate({
      path: 'itineraries',
      options: { default: [] },
    });
    const expiredEvents = await Event.find(
      {
        status: 'past and unclear',
        ticketAvailable: true,
      },
      {
        courseAnalytics: 0,
        cumulativeRevenue: 0,
        ticketSellingDays: 0,
        amtPaid: 0,
        amtPaidTo: 0,
      }
    )
      .limit(2)
      .populate({
        path: 'itineraries',
        options: { default: [] },
      });
    return res.status(StatusCodes.OK).json({ featuredEvents, expiredEvents });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 17
const generateTicketListPdf = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('Please provide an event id.');
    }
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send('Event not found.');
    }
    //check for authorization
    const hasAccess = await isAuthorized(req.user.id, 'user', event.belongsTo);
    if (!hasAccess) {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send('You are not authorized to access this data.');
    }
    let revenue = event.cumulativeRevenue;
    let dates = event.ticketSellingDays;
    let graphData = [];
    let totalRevenue = 0;
    const ticketsSold = event.bookedBy.length;
    const ticketIds = event.bookedBy;
    for (let i = 0; i < revenue.length; i++) {
      let obj = {
        value: revenue[i],
        dataPointText: `₹${revenue[i]}`,
        label: formatDate(dates[i]),
      };
      graphData.push(obj);
      totalRevenue += parseInt(revenue[i]);
    }
    const tickets = await Ticket.aggregate([
      {
        $match: { _id: { $in: ticketIds } },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'boughtBy',
          foreignField: '_id',
          as: 'userMetaData',
        },
      },
      {
        $project: {
          amtPaid: 1,
          generatedAt: 1,
          type: 1,
          userMetaData: {
            name: 1,
            course: 1,
            reg: 1,
            email: 1,
            pushToken: 1,
            image: 1,
          },
        },
      },
    ]);

    const pdfUrl = await generateTicketPDFAndUpload({
      tickets: tickets,
      eventName: event.name,
      graphData,
      totalRevenue,
      totalTicketsSold: ticketsSold,
      clubName: event.belongsTo.name,
    });

    console.log('pdf url', pdfUrl);
    return res.status(StatusCodes.OK).json({ reportURL: pdfUrl });
  } catch (error) {
    console.error('Error sending report:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

//Controller 18
const getReviews = async (req, res) => {
  try {
    const { eventId, batch = 1, batchSize = 10 } = req.query;

    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).send('Event ID is required.');
    }

    const skip = (parseInt(batch) - 1) * parseInt(batchSize);
    const limit = parseInt(batchSize);

    // Step 1: Fetch reviews with pagination
    const reviews = await Ticket.find(
      { eventId, reviewMsg: { $ne: null } },
      {
        reviewMsg: 1,
        reviewStars: 1,
        reviewUrls: 1,
        boughtBy: 1,
        reviewLiked: 1,
      }
    )
      .skip(skip)
      .limit(limit);

    // Step 2: Extract unique userIds
    const userIds = [...new Set(reviews.map((r) => r.boughtBy.toString()))];

    // Step 3: Batch fetch user info
    const users = await User.find(
      { _id: { $in: userIds } },
      {
        name: 1,
        reg: 1,
        image: 1,
        course: 1,
        pushToken: 1,
        interests: 1,
      }
    ).lean();

    const userMap = {};
    users.forEach((user) => {
      userMap[user._id.toString()] = user;
    });

    // Step 4: Attach user info to reviews
    const finalData = reviews.map((review) => ({
      ...review._doc,
      userInfo: userMap[review.boughtBy.toString()] || null,
    }));

    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.error('Error fetching reviews:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

//Controller 19
const checkTicketAvailability = async (req, res) => {
  try {
    const { eventId } = req.query;
    const event = await Event.findById(eventId, {
      bookedBy: 1,
      ticketTypes: 1,
      itineraries: 1,
    }).populate({
      path: 'itineraries',
      options: { default: [] },
    });
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send('Event not found.');
    }
    const ticketTypes = event.ticketTypes.map((ticket) => ticket.type.trim());
    const ticketCounts = await Ticket.aggregate([
      { $match: { _id: { $in: event.bookedBy } } },
      { $group: { _id: '$type', count: { $sum: 1 } } },
    ]);
    const ticketTypesSales = ticketTypes.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {});
    ticketCounts.forEach(({ _id, count }) => {
      if (ticketTypesSales.hasOwnProperty(_id.trim())) {
        ticketTypesSales[_id.trim()] = count;
      }
    });
    return res
      .status(StatusCodes.OK)
      .json({ ticketTypesSales, itineraries: event.itineraries });
  } catch (error) {
    console.error(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

//Controller 20
const checkLiveAttendance = async (req, res) => {
  try {
    const { eventId } = req.query;
    const event = await Event.findById(eventId, {
      bookedBy: 1,
      ticketTypes: 1,
    });
    let ticketTypesEntrance = event.ticketTypes.reduce((acc, ticket) => {
      if (ticket.type) {
        acc[ticket.type.trim()] = [];
      }
      return acc;
    }, {});
    const tickets = await Ticket.find(
      { _id: { $in: event.bookedBy }, status: 'redeemed' },
      { type: 1, boughtBy: 1 }
    );
    const userPromises = tickets.map((ticket) => {
      return User.findById(ticket.boughtBy, { name: 1, image: 1, reg: 1 })
        .then((userInfo) => {
          if (!userInfo) {
            console.warn(`User not found for ID: ${ticket.boughtBy}`);
          }
          return userInfo;
        })
        .catch((error) => {
          console.error(
            `Error fetching user with ID: ${ticket.boughtBy}`,
            error
          );
          return null;
        });
    });
    const users = await Promise.all(userPromises);
    tickets.forEach((ticket, index) => {
      const userInfo = users[index];
      if (ticketTypesEntrance[ticket.type.trim()]) {
        ticketTypesEntrance[ticket.type.trim()].push(userInfo);
      }
    });
    return res.status(StatusCodes.OK).json(ticketTypesEntrance);
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

//Controller 21
const askForReviewSubmission = async (req, res) => {
  try {
    const { eventId } = req.query;
    const event = await Event.findById(eventId, {
      bookedBy: 1,
      name: 1,
      url: 1,
    });
    const notReviewedTicketsUserDetails = await Ticket.aggregate([
      {
        $match: {
          _id: { $in: event.bookedBy },
          reviewMsg: null,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'boughtBy',
          foreignField: '_id',
          pipeline: [
            { $project: { _id: 1, email: 1, pushToken: 1, name: 1, image: 1 } },
          ],
          as: 'userDetails',
        },
      },
      {
        $project: {
          _id: 0,
          pushToken: { $arrayElemAt: ['$userDetails.pushToken', 0] },
          email: { $arrayElemAt: ['$userDetails.email', 0] },
          name: { $arrayElemAt: ['$userDetails.name', 0] },
          image: { $arrayElemAt: ['$userDetails.image', 0] },
          userId: { $arrayElemAt: ['$userDetails._id', 0] },
        },
      },
    ]);
    const userIds = notReviewedTicketsUserDetails.map((user) => user.userId);
    const notice = {
      value: `Share your experience at ${event.name} with us.`,
      img1: event.url,
      img2: event.url,
      key: 'event',
      action: 'yourTickets',
      params: {},
      time: new Date(),
      uid: `${new Date()}/${event.name}/${req.user.id}`,
    };
    await User.updateMany(
      { _id: { $in: userIds } },
      { $push: { unreadNotice: notice } }
    );

    // scheduling for pushing push notice and email
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(`review_${eventId}`, threeSec, async () => {
      for (let i = 0; i < notReviewedTicketsUserDetails.length; i++) {
        const detail = notReviewedTicketsUserDetails[i];
        scheduleNotification(
          [detail.pushToken],
          `Hi ${detail.name}`,
          `How was your experience at ${event.name}? Please review it on your tickets console.`
        );
        const intro = [
          `How was your experience at ${event.name}?`,
          `Please review it by visiting your tickets section.`,
        ];
        const outro = 'We will see you at the next event.';
        const subject = `Review event ${event.name}`;
        const destination = [detail.email];
        const name = `${detail.name}`;
        const { ses, params } = await sendMail(
          name,
          intro,
          outro,
          subject,
          destination
        );
        ses.sendEmail(params, function (err, data) {
          if (err) {
            console.log(err, err.stack);
          }
        });
      }
    });

    return res
      .status(StatusCodes.OK)
      .send('Notifications for event review dispatched.');
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

const getAllTicketsBought = async (req, res) => {
  const { eventId, batch, batchSize } = req.query;
  const actualBatchSize = parseInt(batchSize, 10);
  const skip = batch ? (batch - 1) * actualBatchSize : 0;
  try {
    const [event] = await Event.aggregate([
      {
        $match: { _id: mongoose.Types.ObjectId(eventId) },
      },
      actualBatchSize > 0
        ? {
            $project: {
              bookedBy: { $slice: ['$bookedBy', skip, actualBatchSize] },
              _id: 0,
            },
          }
        : {
            $project: {
              bookedBy: 1,
              _id: 0,
            },
          },
    ]);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send('Event not found.');
    }
    const tickets = await Ticket.aggregate([
      {
        $match: { _id: { $in: event.bookedBy } },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'boughtBy',
          foreignField: '_id',
          as: 'userMetaData',
        },
      },
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
          userMetaData: {
            name: 1,
            course: 1,
            reg: 1,
            email: 1,
            pushToken: 1,
            image: 1,
          },
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(tickets);
  } catch (error) {
    console.error('Error fetching tickets bought:', error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Cannot fetch tickets bought.');
  }
};

const getEvents = async (req, res) => {
  try {
    const events = await Event.find(
      {},
      {
        _id: 1,
        name: 1,
        belongsTo: 1,
        url: 1,
        eventDate: 1,
        startTime: 1,
        endTime: 1,
        place: 1,
      }
    )
      .sort({ eventDate: -1 })
      .limit(10);

    return res.status(200).json(events);
  } catch (error) {
    console.error(error);
    return res.status(500).send('An error occurred while fetching events.');
  }
};

const checkEventStatus = async (req, res) => {
  try {
    const { eventId } = req.query;

    // Check if event exists
    const event = await Event.findById(eventId, {
      status: 1,
      ticketAvailable: 1,
      belongsTo: 1,
    });

    if (!event) {
      return res.status(StatusCodes.OK).json({
        status: 'expired',
        ticketAvailable: false,
        alreadyBooked: false,
        ticketType: null,
        ticketId: null,
        hasAdminAccess: false,
      });
    }

    //find the admin list of the club that has the event organized
    const club = await Club.findById(event.belongsTo.id, { adminId: 1 });
    if (!club) {
      return res.status(StatusCodes.OK).json({
        status: 'expired',
        ticketAvailable: false,
        alreadyBooked: false,
        ticketType: null,
        ticketId: null,
        hasAdminAccess: false,
      });
    }

    // Fetch user's purchased tickets
    const user = await User.findById(req.user.id, { ticketsBought: 1 });

    if (!user || !user.ticketsBought || user.ticketsBought.length === 0) {
      return res.status(StatusCodes.OK).json({
        status: event.status,
        ticketAvailable: event.ticketAvailable,
        alreadyBooked: false,
        ticketType: null,
        ticketId: null,
        hasAdminAccess: club.adminId.includes(req.user.id),
      });
    }

    // Check if user has already booked a ticket for this event
    const matchedTicket = await Ticket.findOne({
      _id: { $in: user.ticketsBought },
      eventId,
    }).lean();

    return res.status(StatusCodes.OK).json({
      status: event.status,
      ticketAvailable: event.ticketAvailable,
      alreadyBooked: !!matchedTicket, // True if a ticket is found
      ticketType: matchedTicket ? matchedTicket.type : null,
      ticketId: matchedTicket ? matchedTicket._id : null,
      hasAdminAccess: club.adminId.includes(req.user.id),
    });
  } catch (error) {
    console.error(error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while fetching event status.',
    });
  }
};

const getEventById = async (req, res) => {
  try {
    const { eventId } = req.query; // Extract eventId from request params

    const event = await Event.findById(eventId).populate({
      path: 'itineraries',
      options: { default: [] }, // Ensures an empty array if no itineraries exist
    });

    if (!event) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: 'Event not found.' });
    }

    return res.status(StatusCodes.OK).json(event);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: 'An error occurred while fetching the event.' });
  }
};

// clear eventFeed of all users
const clearEventFeed = async (req, res) => {
  try {
    await User.updateMany({}, { $set: { eventFeed: [] } });

    return res
      .status(200)
      .json({ message: 'Event feed cleared for all users' });
  } catch (error) {
    console.error('Error clearing event feed:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

const editEventDetails = async (req, res) => {
  try {
    const { eventId, clubId } = req.query;
    const { url, description, ticketTypes } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(eventId) ||
      !mongoose.Types.ObjectId.isValid(clubId)
    ) {
      return res.status(400).json({ message: 'Invalid eventId or clubId' });
    }

    if (!url && !description && !ticketTypes) {
      return res.status(400).json({ message: 'No fields to update' });
    }

    // Update Event
    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      {
        ...(url !== undefined && { url }),
        ...(description !== undefined && { description }),
        ...(ticketTypes !== undefined && { ticketTypes }),
      },
      { new: true }
    );

    if (!updatedEvent) {
      return res.status(404).json({ message: 'Event not found' });
    }

    // Find Club and Update upcomingEvent
    const club = await Club.findById(clubId);
    if (!club) {
      return res.status(404).json({ message: 'Club not found' });
    }

    if (club.upcomingEvent?.length > 0) {
      club.upcomingEvent = club.upcomingEvent.map((e) =>
        e?.eventId?.toString() === eventId
          ? {
              ...e,
              ...(url && { url }),
              ...(description && { description }),
              ...(ticketTypes && { ticketTypes }),
            }
          : e
      );
      await club.save();
    }

    res
      .status(200)
      .json({ message: 'Event updated successfully', event: updatedEvent });
  } catch (error) {
    console.error('Error updating event:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
};

const searchEvents = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string') {
      return res
        .status(400)
        .send('q parameter is required and must be a string');
    }

    // Convert comma-separated string to array
    const keywords = q.split(',').map((word) => word.trim());

    // Build regex patterns
    const regexes = keywords.map((kw) => new RegExp(kw, 'i'));

    const events = await Event.find(
      {
        $or: [
          { name: { $in: regexes } },
          { description: { $in: regexes } },
          { place: { $in: regexes } },
        ],
      },
      {
        _id: 1,
        name: 1,
        belongsTo: 1,
        url: 1,
        eventDate: 1,
        startTime: 1,
        endTime: 1,
        place: 1,
      }
    );

    return res.status(StatusCodes.OK).json(events);
  } catch (error) {
    console.error('Error searching events:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

const mailEventStats = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('Please provide an event id.');
    }
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send('Event not found.');
    }
    let revenue = event.cumulativeRevenue;
    let dates = event.ticketSellingDays;
    let graphData = [];
    let totalRevenue = 0;
    const ticketsSold = event.bookedBy.length;
    const ticketIds = event.bookedBy;
    for (let i = 0; i < revenue.length; i++) {
      let obj = {
        value: revenue[i],
        dataPointText: `₹${revenue[i]}`,
        label: formatDate(dates[i]),
      };
      graphData.push(obj);
      totalRevenue += parseInt(revenue[i]);
    }
    const name = event.authorizedPerson.name;
    const intro = '';
    const outro = '';
    const subject = 'Event report';
    const destination = [event.authorizedPerson.email];
    const tickets = await Ticket.aggregate([
      {
        $match: { _id: { $in: ticketIds } },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'boughtBy',
          foreignField: '_id',
          as: 'userMetaData',
        },
      },
      {
        $project: {
          amtPaid: 1,
          generatedAt: 1,
          type: 1,
          userMetaData: {
            name: 1,
            course: 1,
            reg: 1,
            email: 1,
            pushToken: 1,
            image: 1,
          },
        },
      },
    ]);

    const revenueRows = graphData
      .map(
        ({ label, value }) => `
      <tr>
        <td>${label}</td>
        <td>₹${value}</td>
      </tr>`
      )
      .join('');

    const pdfUrl = await generateTicketPDFAndUpload({
      tickets: tickets,
      eventName: event.name,
      graphData,
      totalRevenue,
      totalTicketsSold: ticketsSold,
      clubName: event.belongsTo.name,
    });

    console.log('pdf url', pdfUrl);

    const emailHTML = generateEmailReportHtml({
      event,
      ticketsSold,
      totalRevenue,
      revenueRows,
      reportURL: pdfUrl,
    });

    const { ses, params } = await sendMail(
      name,
      intro,
      outro,
      subject,
      destination,
      {},
      emailHTML
    );
    await ses.sendEmail(params).promise();
    return res.status(StatusCodes.OK).send('Report successfully mailed!');
  } catch (error) {
    console.error('Error sending report:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

const getPastOrFutureEvents = async (req, res) => {
  try {
    const { mode, size = 6 } = req.query;
    const limitSize = Math.max(parseInt(size), 1); // ensure it's a number >= 1

    const matchStage =
      mode === 'future'
        ? { eventDate: { $gte: new Date() } }
        : { eventDate: { $lt: new Date() } };

    const sortStage = {
      eventDate: mode === 'future' ? 1 : -1,
    };

    const events = await Event.aggregate([
      { $match: matchStage },
      { $sort: sortStage },
      { $limit: limitSize },
      {
        $lookup: {
          from: 'itineraries',
          localField: '_id',
          foreignField: 'eventId',
          as: 'itineraries',
        },
      },
      { $project: { bookedBy: 0 } },
    ]);

    return res.status(StatusCodes.OK).json(events);
  } catch (error) {
    console.error('Error finding events:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send('Server error');
  }
};

module.exports = {
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
  editEventDetails,
  searchEvents,
  mailEventStats,
  getPastOrFutureEvents,
};
