const { StatusCodes } = require('http-status-codes');
const Ticket = require('../models/ticket');
const Event = require('../models/event');
const User = require('../models/user');
const Club = require('../models/club');
const Refunds = require('../models/refunds');
const {
  sendMail,
  scheduleNotification,
  scheduleNotification2,
} = require('../controllers/utils');
const schedule = require('node-schedule');
const axios = require('axios');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { STATUS_CODES } = require('http');

//middleware
const checkAuthorization = async (ticketId, role, id) => {
  const ticket = await Ticket.findById(ticketId);
  const eventId = ticket.eventId;
  const event = await Event.findById(eventId, { belongsTo: 1 });
  const belongsTo = event.belongsTo;
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

//helper function
const updateEventStatsJob = async ({ eventId, amtPaid, userField }) => {
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

    const currentDate = new Date();
    const formattedDate = currentDate.toISOString().split('T')[0];
    const amount = Number(amtPaid) || 0;

    let dayIndex = event.ticketSellingDays.findIndex(
      (d) => d === formattedDate
    );
    if (dayIndex === -1) {
      event.ticketSellingDays.push(formattedDate);
      event.cumulativeRevenue.push(Number(amount));
    } else {
      const currentVal = Number(event.cumulativeRevenue[dayIndex]) || 0;
      event.cumulativeRevenue[dayIndex] = currentVal + amount;
    }

    let courseIndex = event.courseAnalytics.findIndex(
      (entry) => entry.course === userField
    );

    if (courseIndex === -1) {
      event.courseAnalytics.push({ course: userField, count: 1 });
    } else {
      event.courseAnalytics[courseIndex].count += 1;
    }

    await event.save();
    console.log(`Event stats updated successfully for event: ${eventId}`);
  } catch (error) {
    console.error('Error updating event stats:', error);
  }
};

const test = async (req, res) => {
  await updateEventStatsJob({
    eventId: '67d731ffc5ad25cb80a28857',
    amtPaid: '20',
    userField: 'CSE',
  });
  return res.status(StatusCodes.OK).send('Done');
};

//ticket generate secondary actions
const scheduleTicketNotification = (ticket, event, user) => {
  const notifyJobTime = new Date(Date.now() + 5 * 1000);
  const jobName = `notifyTicketPurchase_${ticket._id}_${Date.now()}`;

  schedule.scheduleJob(jobName, notifyJobTime, async () => {
    await sendTicketPurchaseEmail(user, event);
    await sendTicketPurchaseNotifications(user, event);
  });
};

const sendTicketPurchaseEmail = async (user, event) => {
  const intro = [
    `Thank you for purchasing the ticket for the event ${event.name}. Your ticket is available on your Macbease account.`,
    'We will see you there.',
  ];
  const outro = `For any queries please mail on ${event.eventManagerMail} or post a query on the event FAQ console.`;

  const { ses, params } = await sendMail(
    user.name,
    intro,
    outro,
    'Macbease Ticket',
    [user.email],
    {
      instructions: 'Click below to view your ticket:',
      text: 'View Ticket',
      url: `https://macbease.com/app/yourTickets`,
      color: '#1ea1ed',
    }
  );
  ses.sendEmail(params, (err, data) => {
    if (err) console.log(err, err.stack);
  });
};

const sendTicketPurchaseNotifications = async (user, event) => {
  const notificationData = {
    pushToken: [user.pushToken],
    title: 'Ticket successfully purchased!',
    body: `Ticket for ${event.name} has been added to your account.`,
    url: `https://macbease.com/app/yourTickets`,
  };
  scheduleNotification2(notificationData);

  if (event?.authorizedPerson?.pushToken) {
    scheduleNotification2({
      pushToken: [event.authorizedPerson.pushToken],
      title: 'Congratulations! Ticket sold.',
      body: `To see live statistics please visit your ${event.name} event console.`,
      url: `https://macbease.com/app/club/${event.belongsTo}`,
    });
  }
};

//refund helper
const processRefund = async ({
  razorpay_payment_id,
  eventId,
  userId,
  amtPaid,
}) => {
  try {
    // Step 1: Check if the payment ID is already used for a ticket
    const existingTicket = await Ticket.findOne({
      paymentId: razorpay_payment_id,
    });

    if (existingTicket) {
      console.log(
        `Payment ID ${razorpay_payment_id} is already used for a ticket. No refund needed.`
      );
      return;
    }

    // Step 2: Verify payment status from Razorpay API
    const authHeader = `Basic ${Buffer.from(
      `${process.env.RAZOR_PAY_KEY}:${process.env.RAZOR_PAY_SECRET}`
    ).toString('base64')}`;

    const paymentResponse = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      { headers: { Authorization: authHeader } }
    );

    const payment = paymentResponse.data;

    if (payment.status === 'captured') {
      // Step 3: Initiate refund since the payment is valid and not used(still not working)
      // const refundResponse = await axios.post(
      //   `https://api.razorpay.com/v1/payments/${razorpay_payment_id}/refund`,
      //   { amount: 100 }, // Refund full amount
      //   { headers: { Authorization: authHeader } }
      // );

      // Step 4: Log the refund
      await Refunds.create({
        paymentId: razorpay_payment_id,
        eventId,
        userId,
        refundId: null,
        createdAt: new Date(),
        amtRefunded: amtPaid,
        refundStatus: 'PENDING',
      });

      console.log(`Refund initiated successfully.`);
    } else {
      console.log(
        `Payment ID ${razorpay_payment_id} is not captured. Refund not possible.`
      );
    }
  } catch (error) {
    console.error('Refund verification or initiation failed:', error);

    await Refunds.create({
      paymentId: razorpay_payment_id,
      eventId,
      userId,
      reason: error.message,
      createdAt: new Date(),
      amtRefunded: amtPaid,
      refundStatus: 'FAILED',
    });
  }
};

//Controller 1
const generateTicket = async (req, res) => {
  const session = await mongoose.startSession(); // Start transaction session
  session.startTransaction();

  const {
    eventId,
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    amtPaid,
    type,
  } = req.body;

  try {
    if (amtPaid !== 0) {
      if (
        !eventId ||
        !razorpay_payment_id ||
        !razorpay_order_id ||
        !razorpay_signature ||
        !amtPaid ||
        !type
      ) {
        return res.status(400).send('Insufficient data to create a ticket.');
      }

      // Check if the payment ID is already used for a ticket
      const existingTicket = await Ticket.findOne({
        paymentId: razorpay_payment_id,
      });
      if (existingTicket) {
        return res.status(400).send('This payment id has already been used.');
      }

      // Server-side payment verification
      const razorpaySecret = process.env.RAZOR_PAY_SECRET;
      const razorpayKeyId = process.env.RAZOR_PAY_KEY;
      const razorpayKeySecret = process.env.RAZOR_PAY_SECRET;

      // Step 1: Create HMAC Signature for verification
      const expectedSignature = crypto
        .createHmac('sha256', razorpaySecret)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .send('Payment verification failed. Invalid signature.');
      }

      // Step 2: Verify payment via Razorpay API
      const authHeader = `Basic ${Buffer.from(
        `${razorpayKeyId}:${razorpayKeySecret}`
      ).toString('base64')}`;

      const razorpayResponse = await axios.get(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
        {
          headers: { Authorization: authHeader },
        }
      );

      const payment = razorpayResponse.data;

      // Step 3: Validate payment details
      if (payment.status !== 'captured') {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .send('Payment verification failed. Payment not captured.');
      }

      if (payment.amount !== amtPaid * 100) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .send('Payment verification failed. Incorrect amount.');
      }
    }

    // Step 4: Create Ticket
    const ticket = await Ticket.create(
      [
        {
          eventId,
          paymentId: razorpay_payment_id || 'free',
          amtPaid,
          boughtBy: req.user.id,
          generatedAt: new Date(),
          type,
        },
      ],
      { session }
    );

    // Step 5: Fetch Event and User details
    const [event, user] = await Promise.all([
      Event.findById(eventId, {
        name: 1,
        eventManagerMail: 1,
        url: 1,
        authorizedPerson: 1,
        belongsTo: 1,
      }).session(session),

      User.findById(req.user.id, {
        name: 1,
        field: 1,
        email: 1,
        image: 1,
        pushToken: 1,
      }).session(session),
    ]);

    if (!event || !user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send('Event or User not found.');
    }

    // Step 6: Create In-App Notice
    const notice = {
      value: `You have purchased the ticket for ${event.name}`,
      img1: user.image,
      img2: event.url,
      key: 'event',
      action: 'yourTickets',
      params: {},
      time: new Date(),
      uid: `${new Date()}/${ticket[0]._id}/${req.user.id}`,
    };

    // Step 7: Update User and Event Data
    await Promise.all([
      User.findByIdAndUpdate(
        req.user.id,
        {
          $push: {
            ticketsBought: { $each: [ticket[0]._id], $position: 0 },
            unreadNotice: { $each: [notice], $position: 0 },
          },
        },
        { session }
      ),

      Event.findByIdAndUpdate(
        eventId,
        { $push: { bookedBy: ticket[0]._id } },
        { session }
      ),
    ]);

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Step 8: Schedule Event Stats Update (Runs in background)
    const threeSecondsLater = new Date(Date.now() + 3 * 1000);

    schedule.scheduleJob(
      `updateEventStats_${ticket[0]._id}_${Date.now()}`,
      threeSecondsLater,
      () => {
        updateEventStatsJob({
          eventId,
          amtPaid,
          userField: user.field,
        });
        scheduleTicketNotification(ticket[0], event, user);
      }
    );

    return res.status(StatusCodes.OK).json({ ticket: ticket[0] });
  } catch (error) {
    console.error(error);

    if (razorpay_payment_id) {
      await processRefund({
        razorpay_payment_id,
        eventId,
        userId: req.user.id,
        amtPaid,
      });
    }

    await session.abortTransaction();
    session.endSession();
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send(
        'Something went wrong.If money was deducted, a refund will be processed .'
      );
  }
};

//Controller 2
const scanTicket = async (req, res) => {
  const { ticketId, eventId } = req.body;
  try {
    const isAuthorized = await checkAuthorization(
      ticketId,
      req.user.role,
      req.user.id
    );
    if (isAuthorized) {
      let ticket = await Ticket.findById(ticketId);
      if (ticket) {
        const userInfo = await User.findById(ticket.boughtBy, {
          name: 1,
          image: 1,
          reg: 1,
          pushToken: 1,
        });
        if (
          ticket.status === 'active' &&
          ticket.eventId.toString() === eventId
        ) {
          ticket.status = 'redeemed';
          ticket.save();

          //scheduling a job for notification to the buyer
          let threeSec = new Date(Date.now() + 1 * 3 * 1000);
          schedule.scheduleJob(`push_${userInfo._id}`, threeSec, async () => {
            const eventInfo = await Event.findById(eventId, { name: 1 });
            scheduleNotification(
              [userInfo.pushToken],
              `Welcome to ${eventInfo.name}`,
              `Enjoy the event and Carpe Diem!`
            );
          });

          return res
            .status(StatusCodes.OK)
            .json({ msg: 'Ticket scan successful.', userInfo });
        } else {
          return res
            .status(StatusCodes.OK)
            .json({ msg: 'Ticket scan unsuccessful.', userInfo });
        }
      } else {
        return res.status(StatusCodes.OK).json({ msg: 'Invalid ticket id.' });
      }
    } else {
      return res.status(StatusCodes.OK).send('You are not authorized.');
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

//Controller 3
const reviewEvent = async (req, res) => {
  const { ticketId, reviewMsg, reviewUrls, reviewStars } = req.body;
  try {
    let ticket = await Ticket.findById(ticketId, {
      reviewMsg: 1,
      reviewStars: 1,
      reviewUrls: 1,
    });
    ticket.reviewMsg = reviewMsg;
    ticket.reviewStars = reviewStars;
    ticket.reviewUrls = reviewUrls;
    ticket.save();
    return res.status(StatusCodes.OK).send('Event reviewed successfully.');
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send('Something went wrong.');
  }
};

const likeReview = async (req, res) => {
  try {
    const { ticketId } = req.query;
    let ticket = await Ticket.findById(ticketId, { reviewLiked: 1 });
    ticket.reviewLiked = true;
    ticket.save();
    return res.status(StatusCodes.OK).send('Review successfully liked.');
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

const unLikeReview = async (req, res) => {
  try {
    const { ticketId } = req.query;
    let ticket = await Ticket.findById(ticketId, { reviewLiked: 1 });
    ticket.reviewLiked = false;
    ticket.save();
    return res.status(StatusCodes.OK).send('Review successfully unliked.');
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong.');
  }
};

//verify payment controller
const verifyUPIPayment = async (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ message: 'Payment ID is required' });
  }

  try {
    const razorpaySecret = process.env.RAZOR_PAY_SECRET;
    const razorpayKeyId = process.env.RAZOR_PAY_KEY;
    const razorpayKeySecret = process.env.RAZOR_PAY_SECRET;
    const authHeader = `Basic ${Buffer.from(
      `${razorpayKeyId}:${razorpayKeySecret}`
    ).toString('base64')}`;

    const response = await axios.get(
      `https://api.razorpay.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: authHeader },
      }
    );

    return res.status(200).json({
      success: true,
      paymentDetails: response.data,
    });
  } catch (error) {
    console.error(
      'Error fetching Razorpay payment:',
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch payment details',
      error: error.response?.data || error.message,
    });
  }
};

const getTicketsByIds = async (req, res) => {
  try {
    const { ticketIds } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('ticketIds must be a non-empty array.');
    }

    const tickets = await Ticket.find({ _id: { $in: ticketIds } });

    return res.status(StatusCodes.OK).json({ tickets });
  } catch (error) {
    console.error('❌ Error in getTicketsByIds:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong while fetching tickets.');
  }
};

const getTicketTypesCount = async (req, res) => {
  try {
    const { ticketIds } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('ticketIds must be a non-empty array.');
    }

    // Convert to ObjectId and filter invalid ones
    const objectIds = ticketIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (objectIds.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send('No valid ticket IDs provided.');
    }

    const ticketCounts = await Ticket.aggregate([
      { $match: { _id: { $in: objectIds } } },
      {
        $group: {
          _id: '$type',
          count: { $sum: 1 },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json({ ticketCounts });
  } catch (error) {
    console.error('❌ Error in getTicketTypesCount:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong while fetching ticket type counts.');
  }
};

const getTicketFieldsById = async (req, res) => {
  try {
    const { ticketId, fields } = req.body;

    if (!ticketId) {
      return res.status(400).json({ error: 'Ticket ID is required.' });
    }

    if (!fields || !Array.isArray(fields)) {
      return res.status(400).json({ error: 'An array of fields is required.' });
    }

    // Convert array of fields to space-separated string for Mongoose projection
    const projection = fields.join(' ');

    const ticket = await Ticket.findById(ticketId).select(projection);

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    return res.status(200).json({ data: ticket });
  } catch (error) {
    console.error('❌ Error in getTicketFieldsById:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong while fetching ticket.');
  }
};

const getDetailedTickets = async (req, res) => {
  try {
    const { ticketIds } = req.body;
    const tickets = await Ticket.aggregate([
      {
        $match: {
          _id: { $in: ticketIds.map((id) => new mongoose.Types.ObjectId(id)) },
        },
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
    return res.status(StatusCodes.OK).json({ tickets });
  } catch (error) {
    console.error('❌ Error in getDetailedTickets', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong while fetching ticket.');
  }
};

const getReviewedTickets = async (req, res) => {
  try {
    const { eventId, skip = 0, limit = 12 } = req.query;

    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).send('Event ID is required.');
    }

    const skipInt = parseInt(skip);
    const limitInt = parseInt(limit);

    const tickets = await Ticket.find(
      { eventId, reviewMsg: { $ne: null } },
      {
        reviewMsg: 1,
        reviewStars: 1,
        reviewUrls: 1,
        boughtBy: 1,
        reviewLiked: 1,
      }
    )
      .skip(skipInt)
      .limit(limitInt)
      .lean();

    return res.status(StatusCodes.OK).json({ tickets });
  } catch (error) {
    console.error('❌ Error in getReviewedTickets:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong while fetching reviewed tickets.');
  }
};

const getRedeemedTickets = async (req, res) => {
  try {
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).send('Missing eventId.');
    }

    const tickets = await Ticket.find(
      { eventId, status: 'redeemed' },
      { type: 1, boughtBy: 1 }
    ).lean();

    return res.status(StatusCodes.OK).json({ tickets });
  } catch (error) {
    console.error('❌ Error in getRedeemedTickets:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send('Something went wrong while fetching redeemed tickets.');
  }
};

const findEventTicketsBoughtByUser = async (req, res) => {
  try {
    const { eventId, userId } = req.query;

    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).send('Missing eventId.');
    }

    const matchedTickets = await Ticket.find({
      boughtBy: userId,
      eventId,
    }).lean();

    return res.status(StatusCodes.OK).json({ matchedTickets });
  } catch (error) {
    console.error('❌ Error in findEventTicketsBoughtByUser:', error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send(
        'Something went wrong while fetching tickets of a particular event bought by a user.'
      );
  }
};

module.exports = {
  generateTicket,
  scanTicket,
  reviewEvent,
  likeReview,
  unLikeReview,
  verifyUPIPayment,
  test,
  getTicketsByIds,
  getTicketTypesCount,
  getTicketFieldsById,
  getDetailedTickets,
  getReviewedTickets,
  getRedeemedTickets,
  findEventTicketsBoughtByUser,
};
