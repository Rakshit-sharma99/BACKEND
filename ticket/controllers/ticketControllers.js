const { StatusCodes } = require("http-status-codes");
const Ticket = require("../models/ticket");
// const Event = require("../models/event");
// const User = require("../models/user");
// const Club = require("../models/club");
// const {
//   sendMail,
//   scheduleNotification,
//   scheduleNotification2,
// } = require("../controllers/utils");
const schedule = require("node-schedule");
const axios = require("axios");
const crypto = require("crypto");
const mongoose = require("mongoose");
// const { STATUS_CODES } = require("http");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const {
  fetchUserData,
  fetchEventData,
  fetchNativeClubData,
  scheduleNotification,
  getUserMetaMap,
} = require("./utilControllers");

// middleware
const checkAuthorization = async (ticketId, role, id) => {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) return false;

  const eventId = ticket.eventId;
  const event_query = {
    id: eventId,
    fields: ["belongsTo", "universeMetaData"],
  };

  const event = await fetchEventData(event_query);
  if (!event || !event.belongsTo) return false;

  const { belongsTo, universeMetaData } = event;

  // Admins have full access
  if (role === "admin") return true;

  if (belongsTo.type === "Club") {
    const club_query = {
      id: belongsTo.id,
      fields: ["adminId"],
      callSign: universeMetaData?.callSign,
    };

    const club = await fetchNativeClubData(club_query);
    const adminIds = club?.adminId || [];

    return adminIds.includes(id);
  }

  return false;
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
    ).toString("base64")}`;

    const paymentResponse = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      { headers: { Authorization: authHeader } }
    );

    const payment = paymentResponse.data;

    if (payment.status === "captured") {
      // Step 3: Initiate refund since the payment is valid and not used(still not working)
      const refundResponse = await axios.post(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}/refund`,
        { amount: 100 }, // Refund full amount
        { headers: { Authorization: authHeader } }
      );

      // Step 4: Log the refund
      await sendKafkaMessage("CREATE_REFUND", "refund", {
        paymentId: razorpay_payment_id,
        eventId,
        userId,
        amtPaid,
        refundStatus: "PENDING",
      });

      console.log(`Refund initiated successfully.`);
    } else {
      console.log(
        `Payment ID ${razorpay_payment_id} is not captured. Refund not possible.`
      );
    }
  } catch (error) {
    console.error("Refund verification or initiation failed:", error);
    await sendKafkaMessage("CREATE_REFUND", "refund", {
      paymentId: razorpay_payment_id,
      eventId,
      userId,
      amtPaid,
      refundStatus: "FAILED",
    });
  }
};

//Controller 1
const generateTicket = async (req, res) => {
  const session = await mongoose.startSession();
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
    // Validate mandatory fields
    if (
      !eventId ||
      !type ||
      (amtPaid !== 0 &&
        (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature))
    ) {
      return res.status(400).send("Insufficient data to create a ticket.");
    }

    // Check duplicate paymentId
    if (amtPaid !== 0) {
      const existingTicket = await Ticket.findOne({
        paymentId: razorpay_payment_id,
      });
      if (existingTicket) {
        return res.status(400).send("This payment ID has already been used.");
      }

      // Signature verification
      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZOR_PAY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send("Invalid Razorpay signature.");
      }

      // Razorpay API verification
      const authHeader = `Basic ${Buffer.from(
        `${process.env.RAZOR_PAY_KEY}:${process.env.RAZOR_PAY_SECRET}`
      ).toString("base64")}`;

      const { data: payment } = await axios.get(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
        { headers: { Authorization: authHeader } }
      );

      if (payment.status !== "captured") {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send("Payment not captured.");
      }

      if (payment.amount !== amtPaid * 100) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).send("Incorrect payment amount.");
      }
    }

    // Create ticket
    const [ticket] = await Ticket.create(
      [
        {
          eventId,
          paymentId: razorpay_payment_id || "free",
          amtPaid,
          boughtBy: req.user.id,
          generatedAt: new Date(),
          type,
        },
      ],
      { session }
    );

    // Fetch event & user data
    const [event, user] = await Promise.all([
      fetchEventData({
        id: eventId,
        fields: [
          "name",
          "eventManagerMail",
          "url",
          "authorizedPerson",
          "belongsTo",
        ],
      }),
      fetchUserData({
        id: req.user.id,
        fields: ["name", "field", "email", "image", "pushToken"],
      }),
    ]);

    if (!event || !user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).send("Event or User not found.");
    }

    // Send Kafka messages
    await sendKafkaMessage("ADD_TICKET_TO_USER_SCHEMA", req.user.callSign, {
      userId: req.user.id,
      ticketId: ticket._id.toString(),
      eventData: {
        eventId,
        eventName: event.name,
        eventPoster: event.url,
        eventManagerMail: event.eventManagerMail,
      },
    });

    await sendKafkaMessage("ADD_TICKET_TO_EVENT_SCHEMA", "event", {
      eventId,
      ticketId: ticket._id.toString(),
      amtPaid,
      userField: user.field,
    });

    await session.commitTransaction();
    session.endSession();

    return res.status(StatusCodes.OK).json({ ticket });
  } catch (error) {
    console.error("❌ Ticket generation failed:", error);

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
        "Something went wrong. If money was deducted, a refund will be processed."
      );
  }
};

//Controller 2
const scanTicket = async (req, res) => {
  const { ticketId, eventId } = req.body;

  if (!ticketId || !eventId) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ msg: "Missing ticketId or eventId." });
  }

  try {
    // Step 1: Authorization
    const isAuthorized = await checkAuthorization(
      ticketId,
      req.user.role,
      req.user.id
    );

    if (!isAuthorized) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ msg: "You are not authorized to scan this ticket." });
    }

    // Step 2: Fetch ticket
    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ msg: "Ticket not found." });
    }

    // Step 3: Fetch user info
    const user_query = {
      id: ticket.boughtBy,
      fields: ["name", "image", "reg", "pushToken"],
    };
    const userInfo = await fetchUserData(user_query);

    // Step 4: Validate ticket
    const isValidTicket =
      ticket.status === "active" && ticket.eventId.toString() === eventId;

    if (!isValidTicket) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        msg: "Ticket is either already redeemed or does not belong to this event.",
        userInfo,
      });
    }

    // Step 5: Redeem ticket
    ticket.status = "redeemed";
    await ticket.save();

    // Step 6: Schedule notification
    const delay = 3 * 1000; // 3 seconds
    const fireAt = new Date(Date.now() + delay);
    schedule.scheduleJob(`push_${userInfo._id}`, fireAt, async () => {
      const event_query = {
        id: eventId,
        fields: ["name"],
      };
      const eventInfo = await fetchEventData(event_query);

      if (userInfo?.pushToken) {
        scheduleNotification(
          [userInfo.pushToken],
          `Welcome to ${eventInfo.name}`,
          `Enjoy the event and Carpe Diem!`
        );
      }
    });

    return res
      .status(StatusCodes.OK)
      .json({ msg: "Ticket scan successful.", userInfo });
  } catch (error) {
    console.error("🎟️ Error scanning ticket:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong during ticket scan." });
  }
};

//Controller 3
const reviewEvent = async (req, res) => {
  const { ticketId, reviewMsg, reviewUrls, reviewStars } = req.body;

  if (!ticketId || reviewStars == null) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .json({ msg: "Missing ticketId or reviewStars." });
  }

  try {
    const ticket = await Ticket.findById(ticketId, {
      boughtBy: 1,
      reviewMsg: 1,
      reviewStars: 1,
      reviewUrls: 1,
    });

    if (!ticket) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ msg: "Ticket not found." });
    }

    if (ticket.boughtBy.toString() !== req.user.id) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ msg: "You are not authorized to review this ticket." });
    }

    ticket.reviewMsg = reviewMsg;
    ticket.reviewStars = reviewStars;
    ticket.reviewUrls = reviewUrls;

    await ticket.save();

    return res
      .status(StatusCodes.OK)
      .json({ msg: "Event reviewed successfully." });
  } catch (error) {
    console.error("❌ Error reviewing event:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong while submitting your review." });
  }
};

//Controller 4
const likeReview = async (req, res) => {
  try {
    const { ticketId } = req.query;

    if (!ticketId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "ticketId is required." });
    }

    const isAuthorized = await checkAuthorization(
      ticketId,
      req.user.role,
      req.user.id
    );

    if (!isAuthorized) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ msg: "You are not authorized to like this review." });
    }

    const ticket = await Ticket.findById(ticketId, { reviewLiked: 1 });

    if (!ticket) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ msg: "Ticket not found." });
    }

    ticket.reviewLiked = true;
    await ticket.save();

    return res
      .status(StatusCodes.OK)
      .json({ msg: "Review successfully liked." });
  } catch (error) {
    console.error("❌ Error liking review:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong." });
  }
};

//Controller 5
const unLikeReview = async (req, res) => {
  try {
    const { ticketId } = req.query;

    if (!ticketId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "ticketId is required." });
    }

    const isAuthorized = await checkAuthorization(
      ticketId,
      req.user.role,
      req.user.id
    );

    if (!isAuthorized) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ msg: "You are not authorized to unlike this review." });
    }

    const ticket = await Ticket.findById(ticketId, { reviewLiked: 1 });

    if (!ticket) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ msg: "Ticket not found." });
    }

    ticket.reviewLiked = false;
    await ticket.save();

    return res
      .status(StatusCodes.OK)
      .json({ msg: "Review successfully unliked." });
  } catch (error) {
    console.error("❌ Error unliking review:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong." });
  }
};

//Controller 6
const verifyUPIPayment = async (req, res) => {
  const { paymentId } = req.body;

  if (!paymentId) {
    return res.status(400).json({ message: "Payment ID is required" });
  }

  try {
    const razorpayKeyId = process.env.RAZOR_PAY_KEY;
    const razorpayKeySecret = process.env.RAZOR_PAY_SECRET;
    const authHeader = `Basic ${Buffer.from(
      `${razorpayKeyId}:${razorpayKeySecret}`
    ).toString("base64")}`;

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
      "Error fetching Razorpay payment:",
      error.response?.data || error.message
    );
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payment details",
      error: error.response?.data || error.message,
    });
  }
};

//Controller 7
const getTicketsByIds = async (req, res) => {
  try {
    const { ticketIds } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "ticketIds must be a non-empty array." });
    }

    //Validate ObjectId format
    const validIds = ticketIds.filter((id) =>
      mongoose.Types.ObjectId.isValid(id)
    );

    if (validIds.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "All ticketIds are invalid." });
    }

    const tickets = await Ticket.find({ _id: { $in: validIds } });

    return res.status(StatusCodes.OK).json({ tickets });
  } catch (error) {
    console.error("❌ Error in getTicketsByIds:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong while fetching tickets." });
  }
};

//Controller 8
const getTicketTypesCount = async (req, res) => {
  try {
    const { ticketIds } = req.body;

    if (!Array.isArray(ticketIds) || ticketIds.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "ticketIds must be a non-empty array." });
    }

    // Validate and convert to ObjectId
    const objectIds = ticketIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (objectIds.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "No valid ticket IDs provided." });
    }

    const ticketCounts = await Ticket.aggregate([
      { $match: { _id: { $in: objectIds } } },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
        },
      },
    ]);

    // Optional: Transform _id -> type for cleaner response
    const formattedCounts = ticketCounts.map(({ _id, count }) => ({
      type: _id,
      count,
    }));

    return res.status(StatusCodes.OK).json({ ticketCounts: formattedCounts });
  } catch (error) {
    console.error("❌ Error in getTicketTypesCount:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong while fetching ticket type counts." });
  }
};

//Controller 9
const getTicketFieldsById = async (req, res) => {
  try {
    const { ticketId, fields } = req.body;

    if (!ticketId) {
      return res.status(400).json({ error: "Ticket ID is required." });
    }

    if (!fields || !Array.isArray(fields)) {
      return res.status(400).json({ error: "An array of fields is required." });
    }

    // Convert array of fields to space-separated string for Mongoose projection
    const projection = fields.join(" ");

    const ticket = await Ticket.findById(ticketId).select(projection);

    if (!ticket) {
      return res.status(404).json({ error: "Ticket not found." });
    }

    return res.status(200).json({ data: ticket });
  } catch (error) {
    console.error("❌ Error in getTicketFieldsById:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong while fetching ticket.");
  }
};

//Controller 10
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
        $project: {
          _id: 1,
          boughtBy: 1,
          eventId: 1,
          paymentId: 1,
          amtPaid: 1,
          status: 1,
          generatedAt: 1,
          type: 1,
        },
      },
    ]);
    const userIds = [...new Set(tickets.map((t) => t.boughtBy.toString()))];
    const userMap = await getUserMetaMap(userIds, [
      "name",
      "reg",
      "image",
      "course",
      "pushToken",
      "email",
    ]);
    const finalData = tickets.map((ticket) => ({
      ...ticket,
      userMetaData: userMap[ticket.boughtBy.toString()] || null,
    }));
    return res.status(StatusCodes.OK).json({ tickets: finalData });
  } catch (error) {
    console.error("❌ Error in getDetailedTickets", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong while fetching ticket.");
  }
};

//Controller 11
const getReviewedTickets = async (req, res) => {
  try {
    const { eventId, skip = 0, limit = 12 } = req.query;

    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).send("Event ID is required.");
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
    console.error("❌ Error in getReviewedTickets:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong while fetching reviewed tickets.");
  }
};

//Controller 12
const getRedeemedTickets = async (req, res) => {
  try {
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).send("Missing eventId.");
    }

    const tickets = await Ticket.find(
      { eventId, status: "redeemed" },
      { type: 1, boughtBy: 1 }
    ).lean();

    return res.status(StatusCodes.OK).json({ tickets });
  } catch (error) {
    console.error("❌ Error in getRedeemedTickets:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong while fetching redeemed tickets.");
  }
};

//Controller 13
const findEventTicketsBoughtByUser = async (req, res) => {
  try {
    const { eventId, userId } = req.query;

    if (!eventId || !userId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Missing eventId or userId." });
    }

    if (
      !mongoose.Types.ObjectId.isValid(eventId) ||
      !mongoose.Types.ObjectId.isValid(userId)
    ) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Invalid eventId or userId." });
    }

    const matchedTickets = await Ticket.find({
      boughtBy: new mongoose.Types.ObjectId(userId),
      eventId: new mongoose.Types.ObjectId(eventId),
    }).lean();

    return res.status(StatusCodes.OK).json({ matchedTickets });
  } catch (error) {
    console.error("❌ Error in findEventTicketsBoughtByUser:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Something went wrong while fetching tickets bought by the user for the event.",
    });
  }
};

const getTicketFieldsByQuery = async (req, res) => {
  try {
    const { searchBy, fields, single = false } = req.body;

    if (!searchBy || typeof searchBy !== "object" || !Object.keys(searchBy).length) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "searchBy must be a non-empty object",
      });
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "fields must be a non-empty array",
      });
    }

    Object.keys(searchBy).forEach((key) => {
      if (mongoose.Types.ObjectId.isValid(searchBy[key])) {
        searchBy[key] = new mongoose.Types.ObjectId(searchBy[key]);
      }
    });

    const projection = fields.join(" ");

    let query = Ticket.find(searchBy).select(projection).lean();

    if (single === true) {
      query = Ticket.findOne(searchBy).select(projection).lean();
    }

    const result = await query;

    if (!result || (Array.isArray(result) && result.length === 0)) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "No ticket(s) found",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("❌ Error in getTicketFieldsByQuery:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Something went wrong while fetching ticket(s).",
    });
  }
};

module.exports = {
  generateTicket,
  scanTicket,
  reviewEvent,
  likeReview,
  unLikeReview,
  verifyUPIPayment,
  getTicketsByIds,
  getTicketTypesCount,
  getTicketFieldsById,
  getDetailedTickets,
  getReviewedTickets,
  getRedeemedTickets,
  findEventTicketsBoughtByUser,
  getTicketFieldsByQuery
};
