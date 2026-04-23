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
  fetchLayoutById,
  fetchNativeClubData,
  scheduleNotification,
  getUserMetaMap,
  fetchItineraries,
  fetchItinerary,
  verifyTicketPurchaseAccess,
  formatEventDateRange,
  formatTimeStamp,
  generateSingleTicketPDFAndUpload,
} = require("./utilControllers");
const { io } = require("../app");
const {
  redis,
  verifySeatLocks,
  buildSeatId,
} = require("../utils/seatUtils");

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
        `Payment ID ${razorpay_payment_id} is already used for a ticket. No refund needed.`,
      );
      return;
    }

    // Step 2: Verify payment status from Razorpay API
    const authHeader = `Basic ${Buffer.from(
      `${process.env.RAZOR_PAY_KEY}:${process.env.RAZOR_PAY_SECRET}`,
    ).toString("base64")}`;

    const paymentResponse = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      { headers: { Authorization: authHeader } },
    );

    const payment = paymentResponse.data;

    if (payment.status === "captured") {
      // Step 3: Initiate refund since the payment is valid and not used(still not working)
      const refundResponse = await axios.post(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}/refund`,
        { amount: 100 }, // Refund full amount
        { headers: { Authorization: authHeader } },
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
        `Payment ID ${razorpay_payment_id} is not captured. Refund not possible.`,
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

function collectValidSeatIds(layout) {
  const validSeatIds = new Set();

  if (Array.isArray(layout?.levels)) {
    layout.levels.forEach((level) => {
      (level.rows || []).forEach((row) => {
        for (let i = 1; i <= row.seats; i++) {
          validSeatIds.add(
            buildSeatId({
              levelCode: level.code,
              rowCode: row.code,
              seatNumber: i,
              hasLevels: true,
              hasBlocks: false,
            }),
          );
        }
      });
    });
  }

  if (Array.isArray(layout?.blocks)) {
    layout.blocks.forEach((block) => {
      (block.rows || []).forEach((row) => {
        for (let i = 1; i <= row.seats; i++) {
          validSeatIds.add(
            buildSeatId({
              blockCode: block.code,
              rowCode: row.code,
              seatNumber: i,
              hasLevels: false,
              hasBlocks: true,
            }),
          );
        }
      });
    });
  }

  return validSeatIds;
}

function verifySeatIds(layout, seatIds = []) {
  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    return {
      isValid: true,
      invalidSeatIds: [],
      message: "No seat IDs provided.",
    };
  }

  const validSeatIds = collectValidSeatIds(layout);
  const invalidSeatIds = seatIds.filter((seatId) => !validSeatIds.has(seatId));

  return {
    isValid: invalidSeatIds.length === 0,
    invalidSeatIds,
    message:
      invalidSeatIds.length > 0
        ? `Invalid seat IDs: ${invalidSeatIds.join(", ")}`
        : "All seat IDs are valid.",
  };
}

function createHttpError(message, status = StatusCodes.BAD_REQUEST) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function normalizeSeatGroups(seats = []) {
  if (!Array.isArray(seats)) {
    return [];
  }

  return seats
    .map((group) => ({
      type: String(group?.type || group?.ticketType || "").trim(),
      seatIds: Array.isArray(group?.seatIds)
        ? group.seatIds
            .map((seatId) => String(seatId || "").trim())
            .filter(Boolean)
        : [],
    }))
    .filter((group) => group.type && group.seatIds.length > 0);
}

function buildRequestedTickets({ type, types, seats }) {
  const seatGroups = normalizeSeatGroups(seats);

  if (seatGroups.length > 0) {
    return {
      explicitSeatSelection: true,
      requestedTickets: seatGroups.flatMap((group) =>
        group.seatIds.map((seatId) => ({
          type: group.type,
          seatId,
        })),
      ),
    };
  }

  const requestedTypes = (
    Array.isArray(types) && types.length > 0 ? types : type ? [type] : []
  )
    .map((value) => String(value || "").trim())
    .filter(Boolean);

  return {
    explicitSeatSelection: false,
    requestedTickets: requestedTypes.map((ticketType) => ({
      type: ticketType,
      seatId: null,
    })),
  };
}

function buildLayoutSeatCatalog(layout) {
  const catalog = [];

  const appendRows = ({ sections = [], hasLevels, hasBlocks }) => {
    sections.forEach((section) => {
      (section.rows || []).forEach((row) => {
        for (let i = 1; i <= row.seats; i++) {
          catalog.push({
            seatId: buildSeatId({
              levelCode: hasLevels ? section.code : null,
              blockCode: hasBlocks ? section.code : null,
              rowCode: row.code,
              seatNumber: i,
              hasLevels,
              hasBlocks,
            }),
            ticketType: row.ticketType || null,
          });
        }
      });
    });
  };

  if (Array.isArray(layout?.levels) && layout.levels.length > 0) {
    appendRows({
      sections: layout.levels,
      hasLevels: true,
      hasBlocks: false,
    });
  }

  if (Array.isArray(layout?.blocks) && layout.blocks.length > 0) {
    appendRows({
      sections: layout.blocks,
      hasLevels: false,
      hasBlocks: true,
    });
  }

  return catalog;
}

function getDuplicateSeatIds(seatIds = []) {
  const seen = new Set();
  const duplicates = new Set();

  seatIds.forEach((seatId) => {
    if (seen.has(seatId)) {
      duplicates.add(seatId);
      return;
    }

    seen.add(seatId);
  });

  return [...duplicates];
}

function findMatchingTicketType(ticketTypes = [], requestedType) {
  return ticketTypes.find(
    (ticketType) =>
      ticketType?.type === requestedType ||
      ticketType?._id?.toString() === requestedType?.toString(),
  );
}

function seatBelongsToTicketType(rowTicketType, ticketMeta) {
  if (!rowTicketType || !ticketMeta) {
    return false;
  }

  const allowedTypes = new Set(
    [ticketMeta.type, ticketMeta._id?.toString()].filter(Boolean),
  );

  return allowedTypes.has(rowTicketType);
}

function distributeAmountAcrossTickets(totalAmount, count) {
  if (!count || count <= 0) {
    return [];
  }

  const totalPaise = Math.round(Number(totalAmount || 0) * 100);
  const basePaise = Math.floor(totalPaise / count);
  const remainder = totalPaise % count;

  return Array.from({ length: count }, (_, index) => {
    const paise = basePaise + (index < remainder ? 1 : 0);
    return paise / 100;
  });
}

async function fetchSoldCountsByType(eventId, ticketTypes = []) {
  if (!eventId || ticketTypes.length === 0) {
    return {};
  }

  const eventObjectId = mongoose.Types.ObjectId.isValid(eventId)
    ? new mongoose.Types.ObjectId(eventId)
    : eventId;

  const counts = await Ticket.aggregate([
    {
      $match: {
        eventId: eventObjectId,
        type: { $in: ticketTypes },
      },
    },
    {
      $group: {
        _id: "$type",
        count: { $sum: 1 },
      },
    },
  ]);

  return counts.reduce((acc, item) => {
    acc[item._id] = item.count;
    return acc;
  }, {});
}

async function lockSeatsForTicketGeneration({ eventId, userId, seatIds = [] }) {
  if (!eventId || !userId || seatIds.length === 0) {
    return [];
  }

  const lockedSeatIds = [];

  for (const seatId of seatIds) {
    const seatKey = `seat:${eventId}:${seatId}`;
    const existingLock = await redis.get(seatKey);

    if (existingLock && existingLock !== userId) {
      for (const lockedSeatId of lockedSeatIds) {
        await redis.del(`seat:${eventId}:${lockedSeatId}`);
      }

      throw createHttpError(
        `Seat ${seatId} is not available anymore.`,
        StatusCodes.CONFLICT,
      );
    }

    if (existingLock === userId) {
      lockedSeatIds.push(seatId);
      continue;
    }

    const result = await redis.set(seatKey, userId, "NX", "EX", 300);

    if (!result) {
      for (const lockedSeatId of lockedSeatIds) {
        await redis.del(`seat:${eventId}:${lockedSeatId}`);
      }

      throw createHttpError(
        `Seat ${seatId} is not available anymore.`,
        StatusCodes.CONFLICT,
      );
    }

    lockedSeatIds.push(seatId);
  }

  return lockedSeatIds;
}

async function releaseSeatLocks({ eventId, userId, seatIds = [] }) {
  if (!eventId || !userId || seatIds.length === 0) {
    return;
  }

  for (const seatId of seatIds) {
    const seatKey = `seat:${eventId}:${seatId}`;
    const existingLock = await redis.get(seatKey);

    if (existingLock === userId) {
      await redis.del(seatKey);
    }
  }
}

async function getLockedSeatIdsForEvent(eventId) {
  if (!eventId) {
    return [];
  }

  const lockedKeys = await redis.keys(`seat:${eventId}:*`);
  return lockedKeys.map((key) => key.split(":")[2]);
}

function buildTicketAccessMap(ticketAccess = [], fallbackType = null, privateCode = null) {
  const accessMap = {};

  if (Array.isArray(ticketAccess)) {
    ticketAccess.forEach((entry) => {
      const type = String(entry?.type || "").trim();
      if (!type) {
        return;
      }

      accessMap[type] = String(entry?.privateCode || "").trim();
    });
  }

  if (fallbackType && privateCode && !accessMap[fallbackType]) {
    accessMap[fallbackType] = String(privateCode).trim();
  }

  return accessMap;
}

async function validateTicketPurchaseAccess({
  eventId,
  types = [],
  userId,
  uid,
  privateCode,
  ticketAccess,
}) {
  const uniqueTypes = [...new Set((types || []).filter(Boolean))];
  const accessMap = buildTicketAccessMap(
    ticketAccess,
    uniqueTypes.length === 1 ? uniqueTypes[0] : null,
    privateCode,
  );

  for (const ticketType of uniqueTypes) {
    const result = await verifyTicketPurchaseAccess({
      eventId,
      ticketType,
      privateCode: accessMap[ticketType],
      uid,
      userId,
    });

    if (!result?.canBuy) {
      throw createHttpError(
        result?.message || `You are not allowed to buy ${ticketType}.`,
        StatusCodes.FORBIDDEN,
      );
    }
  }
}

//Controller 1
const generateTicket = async (req, res) => {
  const {
    eventId,
    razorpay_payment_id,
    razorpay_order_id,
    razorpay_signature,
    amtPaid,
    type,
    types,
    seats,
    extraFieldsData,
    couponId,
    privateCode,
    ticketAccess,
    uid,
    universeMetaData,
  } = req.body;

  const safeUserId = req.user.id?.toString();
  const amountPaid = Number(amtPaid || 0);
  let shouldRefund = false;
  let session = null;
  let seatIdsToRelease = [];

  try {
    const { explicitSeatSelection, requestedTickets } = buildRequestedTickets({
      type,
      types,
      seats,
    });

    if (
      !eventId ||
      requestedTickets.length === 0 ||
      (amountPaid !== 0 &&
        (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature))
    ) {
      throw createHttpError("Insufficient data to create a ticket.");
    }

    if (amountPaid !== 0) {
      const existingTicket = await Ticket.findOne({
        paymentId: razorpay_payment_id,
      });
      if (existingTicket) {
        return res.status(400).send("This payment ID has already been used.");
      }

      const expectedSignature = crypto
        .createHmac("sha256", process.env.RAZOR_PAY_SECRET)
        .update(`${razorpay_order_id}|${razorpay_payment_id}`)
        .digest("hex");

      if (expectedSignature !== razorpay_signature) {
        throw createHttpError("Invalid Razorpay signature.");
      }

      const authHeader = `Basic ${Buffer.from(
        `${process.env.RAZOR_PAY_KEY}:${process.env.RAZOR_PAY_SECRET}`,
      ).toString("base64")}`;

      const { data: payment } = await axios.get(
        `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
        { headers: { Authorization: authHeader } },
      );

      if (payment.status !== "captured") {
        throw createHttpError("Payment not captured.");
      }

      if (payment.amount !== Math.round(amountPaid * 100)) {
        throw createHttpError("Incorrect payment amount.");
      }

      shouldRefund = true;
    }

    const [event, user] = await Promise.all([
      fetchEventData({
        id: eventId,
        fields: [
          "name",
          "eventManagerMail",
          "url",
          "authorizedPerson",
          "belongsTo",
          "ticketTypes",
          "layoutId",
          "seatsBooked",
          "uid",
          "universeMetaData",
        ],
      }),
      fetchUserData({
        id: req.user.id,
        fields: ["name", "field", "email", "image", "pushToken"],
      }),
    ]);

    if (!event || !user) {
      throw createHttpError("Event or User not found.", StatusCodes.NOT_FOUND);
    }

    let finalizedTickets = requestedTickets.map((ticket) => {
      const matchedTicketType =
        Array.isArray(event.ticketTypes) && event.ticketTypes.length > 0
          ? findMatchingTicketType(event.ticketTypes, ticket.type)
          : null;

      if (Array.isArray(event.ticketTypes) && event.ticketTypes.length > 0) {
        if (!matchedTicketType) {
          throw createHttpError(`Ticket type "${ticket.type}" not found.`);
        }
      }

      return {
        ...ticket,
        type: matchedTicketType?.type || ticket.type,
        ticketMeta: matchedTicketType || null,
      };
    });

    if (Array.isArray(event.ticketTypes) && event.ticketTypes.length > 0) {
      const requestedCounts = finalizedTickets.reduce((acc, ticket) => {
        acc[ticket.type] = (acc[ticket.type] || 0) + 1;
        return acc;
      }, {});

      const soldCounts = await fetchSoldCountsByType(
        eventId,
        Object.keys(requestedCounts),
      );

      Object.entries(requestedCounts).forEach(([ticketType, requestedCount]) => {
        const matchedType = event.ticketTypes.find(
          (eventTicketType) => eventTicketType?.type === ticketType,
        );

        const availableCount = Number(matchedType?.available);

        if (
          Number.isFinite(availableCount) &&
          (soldCounts[ticketType] || 0) + requestedCount > availableCount
        ) {
          throw createHttpError(
            `${ticketType} tickets are sold out or no longer available.`,
            StatusCodes.CONFLICT,
          );
        }
      });
    }

    await validateTicketPurchaseAccess({
      eventId,
      types: finalizedTickets.map((ticket) => ticket.type),
      userId: req.user.id,
      uid: uid || req.user.uid,
      privateCode,
      ticketAccess,
    });

    if (event.layoutId) {
      const layout = await fetchLayoutById(event.layoutId);

      if (!layout) {
        throw createHttpError("Layout not found.", StatusCodes.NOT_FOUND);
      }

      const layoutSeatCatalog = buildLayoutSeatCatalog(layout);
      const seatTypeMap = new Map(
        layoutSeatCatalog.map((seat) => [seat.seatId, seat.ticketType]),
      );
      const bookedSeatsSet = new Set(event.seatsBooked || []);

      if (explicitSeatSelection) {
        const requestedSeatIds = finalizedTickets.map((ticket) => ticket.seatId);
        const duplicateSeatIds = getDuplicateSeatIds(requestedSeatIds);

        if (duplicateSeatIds.length > 0) {
          throw createHttpError(
            `Duplicate seats selected: ${duplicateSeatIds.join(", ")}`,
          );
        }

        const seatIdVerification = verifySeatIds(layout, requestedSeatIds);

        if (!seatIdVerification.isValid) {
          throw createHttpError(seatIdVerification.message);
        }

        if (amountPaid === 0) {
          seatIdsToRelease = await lockSeatsForTicketGeneration({
            eventId,
            userId: safeUserId,
            seatIds: requestedSeatIds,
          });
        } else {
          const canBookSeats = await verifySeatLocks(
            requestedSeatIds,
            eventId,
            safeUserId,
          );

          if (!canBookSeats) {
            throw createHttpError(
              "Selected seats are not available or not locked by you.",
              StatusCodes.CONFLICT,
            );
          }

          seatIdsToRelease = requestedSeatIds;
        }

        finalizedTickets.forEach((ticket) => {
          if (bookedSeatsSet.has(ticket.seatId)) {
            throw createHttpError(
              `Seat ${ticket.seatId} is already booked.`,
              StatusCodes.CONFLICT,
            );
          }

          if (
            !seatBelongsToTicketType(
              seatTypeMap.get(ticket.seatId),
              ticket.ticketMeta,
            )
          ) {
            throw createHttpError(
              `Seat ${ticket.seatId} does not belong to ticket type "${ticket.type}".`,
            );
          }
        });
      } else {
        const lockedSeatsSet = new Set(await getLockedSeatIdsForEvent(eventId));
        const assignedSeatIdsByType = {};
        const requestedCounts = finalizedTickets.reduce((acc, ticket) => {
          acc[ticket.type] = (acc[ticket.type] || 0) + 1;
          return acc;
        }, {});

        Object.entries(requestedCounts).forEach(([ticketType, requestedCount]) => {
          const sampleTicket = finalizedTickets.find(
            (ticket) => ticket.type === ticketType,
          );

          const availableSeatIds = layoutSeatCatalog
            .filter((seat) => {
              if (
                bookedSeatsSet.has(seat.seatId) ||
                lockedSeatsSet.has(seat.seatId)
              ) {
                return false;
              }

              return seatBelongsToTicketType(
                seat.ticketType,
                sampleTicket.ticketMeta,
              );
            })
            .map((seat) => seat.seatId);

          if (availableSeatIds.length < requestedCount) {
            throw createHttpError(
              `Not enough seats are available for ticket type "${ticketType}".`,
              StatusCodes.CONFLICT,
            );
          }

          assignedSeatIdsByType[ticketType] = availableSeatIds.slice(
            0,
            requestedCount,
          );

          assignedSeatIdsByType[ticketType].forEach((seatId) => {
            lockedSeatsSet.add(seatId);
          });
        });

        seatIdsToRelease = await lockSeatsForTicketGeneration({
          eventId,
          userId: safeUserId,
          seatIds: Object.values(assignedSeatIdsByType).flat(),
        });

        finalizedTickets = finalizedTickets.map((ticket) => ({
          ...ticket,
          seatId: assignedSeatIdsByType[ticket.type].shift(),
        }));
      }
    } else if (explicitSeatSelection) {
      throw createHttpError("This event does not support reserved seating.");
    }

    const ticketAmounts = distributeAmountAcrossTickets(
      amountPaid,
      finalizedTickets.length,
    );
    const ticketUid = uid || event.uid || null;
    const ticketUniverseMetaData = universeMetaData || event.universeMetaData || null;

    session = await mongoose.startSession();
    session.startTransaction();

    const createdTickets = await Ticket.create(
      finalizedTickets.map((ticket, index) => ({
        eventId,
        paymentId: razorpay_payment_id || "free",
        amtPaid: ticketAmounts[index] || 0,
        boughtBy: req.user.id,
        generatedAt: new Date(),
        type: ticket.type,
        seatId: ticket.seatId || undefined,
        extraFieldsData,
        couponId,
        uid: ticketUid,
        universeMetaData: ticketUniverseMetaData,
      })),
      { session },
    );

    for (let index = 0; index < createdTickets.length; index++) {
      const ticket = createdTickets[index];

      await sendKafkaMessage("ADD_TICKET_TO_USER_SCHEMA", "universe", {
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
        amtPaid: ticketAmounts[index] || 0,
        userField: user.field,
        seatIds: ticket.seatId ? [ticket.seatId] : [],
      });
    }

    try {
      await sendKafkaMessage("USER_ACTIVITY", "user", {
        userId: req.user.id,
        uid: req.user.uid,
        activityType: "event_attend",
        ref: eventId,
      });
    } catch (kafkaErr) {
      console.error("user.activity publish failed:", kafkaErr.message);
    }

    // Add user to event channel via Kafka
    try {
      await sendKafkaMessage("ADD_MEMBER_TO_CHANNEL", "event", {
        userId: req.user.id,
        ticketId: ticket._id.toString(),
      });
    } catch (kafkaErr) {
      console.error("add_member_to_channel publish failed:", kafkaErr.message);
    }

    await session.commitTransaction();
    await releaseSeatLocks({
      eventId,
      userId: safeUserId,
      seatIds: seatIdsToRelease,
    });
    session.endSession();
    session = null;

    return res.status(StatusCodes.OK).json({
      ticket: createdTickets[0] || null,
      tickets: createdTickets,
    });
  } catch (error) {
    console.error("❌ Ticket generation failed:", error);

    if (seatIdsToRelease.length > 0) {
      await releaseSeatLocks({
        eventId,
        userId: safeUserId,
        seatIds: seatIdsToRelease,
      });
    }

    if (session?.inTransaction()) {
      await session.abortTransaction();
    }

    if (session) {
      session.endSession();
      session = null;
    }

    if (razorpay_payment_id && shouldRefund) {
      await processRefund({
        razorpay_payment_id,
        eventId,
        userId: req.user.id,
        amtPaid: amountPaid,
      });
    }

    if (error?.code === 11000 && error?.keyPattern?.seatId) {
      return res
        .status(StatusCodes.CONFLICT)
        .send(
          "One of the selected seats was booked just now. If money was deducted, a refund will be processed.",
        );
    }

    if (error?.status) {
      return res.status(error.status).send(error.message);
    }

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send(
        "Something went wrong. If money was deducted, a refund will be processed.",
      );
  }
};

// util function to mark all itineraries as scanned
const markAllItineraries = async ({ ticketId, eventId, userId }) => {
  try {
    const ticketData = await Ticket.findById(ticketId, {
      type: 1,
      checkPoints: 1,
    });

    const event_query = {
      id: eventId,
      fields: ["itineraries"],
    };

    const { itineraries } = await fetchEventData(event_query);

    const itinerariesData = await fetchItineraries({
      itineraryIds: itineraries,
    });

    // filter itineraries where this ticket type is allowed
    const allowedItineraries = itinerariesData.filter((i) =>
      i.allowed.includes(ticketData.type),
    );

    const allowedItinerariesIds = allowedItineraries.map((a) => a._id);

    // update ticket checkpoints
    ticketData.checkPoints = allowedItinerariesIds;
    await ticketData.save();

    // update attendance lists for all itineraries in parallel
    await sendKafkaMessage("ITINERARY_UPDATE_OPERATION", "itinerary", {
      operation: "PUSH",
      targetType: "MULTIPLE",
      field: "attendanceList",
      value: userId,
      itineraryIds: allowedItinerariesIds,
    });

    return { success: true };
  } catch (error) {
    console.error(error);
    return { success: false, error: error.message };
  }
};

//Controller 2
// const scanTicket = async (req, res) => {
//   const { ticketId, eventId } = req.body;

//   if (!ticketId || !eventId) {
//     return res
//       .status(StatusCodes.BAD_REQUEST)
//       .json({ msg: "Missing ticketId or eventId." });
//   }

//   try {
//     // Step 1: Authorization
//     const isAuthorized = await checkAuthorization(
//       ticketId,
//       req.user.role,
//       req.user.id
//     );

//     if (!isAuthorized) {
//       return res
//         .status(StatusCodes.FORBIDDEN)
//         .json({ msg: "You are not authorized to scan this ticket." });
//     }

//     // Step 2: Fetch ticket
//     const ticket = await Ticket.findById(ticketId);
//     if (!ticket) {
//       return res
//         .status(StatusCodes.NOT_FOUND)
//         .json({ msg: "Ticket not found." });
//     }

//     // Step 3: Fetch user info
//     const user_query = {
//       id: ticket.boughtBy,
//       fields: ["name", "image", "reg", "pushToken"],
//     };
//     const userInfo = await fetchUserData(user_query);

//     // Step 4: Validate ticket
//     const isValidTicket =
//       ticket.status === "active" && ticket.eventId.toString() === eventId;

//     if (!isValidTicket) {
//       return res.status(StatusCodes.BAD_REQUEST).json({
//         msg: "Ticket is either already redeemed or does not belong to this event.",
//         userInfo,
//       });
//     }

//     // Step 5: Redeem ticket
//     ticket.status = "redeemed";
//     await ticket.save();

//     // Step 6: Schedule notification
//     const delay = 3 * 1000; // 3 seconds
//     const fireAt = new Date(Date.now() + delay);
//     schedule.scheduleJob(`push_${userInfo._id}`, fireAt, async () => {
//       const event_query = {
//         id: eventId,
//         fields: ["name"],
//       };
//       const eventInfo = await fetchEventData(event_query);

//       if (userInfo?.pushToken) {
//         scheduleNotification(
//           [userInfo.pushToken],
//           `Welcome to ${eventInfo.name}`,
//           `Enjoy the event and Carpe Diem!`
//         );
//       }
//     });

//     return res
//       .status(StatusCodes.OK)
//       .json({ msg: "Ticket scan successful.", userInfo });
//   } catch (error) {
//     console.error("🎟️ Error scanning ticket:", error);
//     return res
//       .status(StatusCodes.INTERNAL_SERVER_ERROR)
//       .json({ msg: "Something went wrong during ticket scan." });
//   }
// };

const scanTicket = async (req, res) => {
  const { ticketId, eventId } = req.body;
  try {
    const event_query = {
      id: eventId,
      fields: ["name", "permissions"],
    };
    const eventData = await fetchEventData(event_query);
    const isAuthorized =
      req.user.role === "admin" ||
      eventData.permissions["whoCanScanTickets"].includes(req.user.id);
    if (isAuthorized) {
      let ticket = await Ticket.findById(ticketId);
      if (ticket) {
        const userInfo = await fetchUserData({
          id: ticket.boughtBy,
          fields: ["name", "reg", "image", "pushToken"],
        });
        if (
          ticket.status === "active" &&
          ticket.eventId.toString() === eventId
        ) {
          ticket.status = "redeemed";
          await ticket.save();
          await markAllItineraries({
            eventId,
            ticketId,
            userId: ticket.boughtBy,
          });

          //scheduling a job for notification to the buyer
          let threeSec = new Date(Date.now() + 1 * 3 * 1000);
          schedule.scheduleJob(`push_${userInfo._id}`, threeSec, async () => {
            scheduleNotification(
              [userInfo.pushToken],
              `Welcome to ${eventData.name}`,
              `Enjoy the event and Carpe Diem!`,
            );
          });
          io.emit(`ticketScan_${ticketId}`, {
            itinerary: "the event",
          });
          return res
            .status(StatusCodes.OK)
            .json({ msg: "Ticket scan successful.", userInfo });
        } else {
          io.emit(`ticketAlreadyScanned_${ticketId}`, {
            itinerary: "the event",
          });
          return res
            .status(StatusCodes.OK)
            .json({ msg: "Ticket already scanned!" });
        }
      } else {
        return res.status(StatusCodes.OK).json({ msg: "Invalid ticket id." });
      }
    } else {
      return res.status(StatusCodes.FORBIDDEN).send("You are not authorized.");
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

// util function to find maximum allowed itineraries on a ticket
const findAllAllowedItineraries = async ({ ticketId, eventId }) => {
  try {
    const ticketData = await Ticket.findById(ticketId, {
      type: 1,
      checkPoints: 1,
    });

    const event_query = {
      id: eventId,
      fields: ["itineraries"],
    };

    const { itineraries } = await fetchEventData(event_query);

    const itinerariesData = await fetchItineraries({
      itineraryIds: itineraries,
    });

    // filter itineraries where this ticket type is allowed
    const allowedItineraries = itinerariesData.filter((i) =>
      i.allowed.includes(ticketData.type),
    );

    return allowedItineraries.length;
  } catch (error) {
    console.log(error);
  }
};

const checkPointScan = async (req, res) => {
  try {
    const { ticketId, eventId, itineraryId } = req.body;

    // Authorization
    const isAuthorized = await checkAuthorization(
      ticketId,
      req.user.role,
      req.user.id,
    );

    if (!isAuthorized) {
      return res.status(StatusCodes.FORBIDDEN).send("You are not authorized.");
    }

    const [eventData, itineraryData, ticketData, userData] = await Promise.all([
      fetchEventData({ id: eventId, fields: ["name", "itineraries"] }),
      fetchItinerary({ id: itineraryId, fields: ["allowed", "title"] }),
      Ticket.findById(ticketId, {
        type: 1,
        checkPoints: 1,
        boughtBy: 1,
      }).lean(),
      fetchUserData({
        id: ticketData.boughtBy,
        fields: ["name", "reg", "image", "pushToken"],
      }),
    ]);

    if (!eventData || !itineraryData || !ticketData) {
      return res.status(StatusCodes.NOT_FOUND).send("Invalid IDs provided.");
    }

    // Check if event includes the itinerary
    const validItinerary = eventData.itineraries.some((id) =>
      id.equals(itineraryId),
    );
    if (!validItinerary) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Invalid itinerary id provided.");
    }

    // Check if ticket type is valid for the itinerary
    const validTicket = itineraryData.allowed.includes(ticketData.type);
    if (!validTicket) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Invalid ticket provided.");
    }

    // Check if the ticket is already scanned for that check point
    const validCheckPoint = !(ticketData.checkPoints ?? []).some((id) =>
      id.equals(itineraryId),
    );

    if (!validCheckPoint) {
      io.emit(`ticketAlreadyScanned_${ticketId}`, {
        itinerary: itineraryData.title,
      });
      return res
        .status(StatusCodes.OK)
        .json({ msg: "Ticket already scanned!" });
    }

    // Atomically update ticket (prevent race condition & duplicates)
    const ticketUpdate = await Ticket.updateOne(
      { _id: ticketId },
      { $addToSet: { checkPoints: itineraryId } },
    );

    const maxItineraiesAllowed = await findAllAllowedItineraries({
      ticketId,
      eventId,
    });
    const ticket = await Ticket.findById(ticketId, {
      checkPoints: 1,
      status: 1,
    });
    if ((ticket.checkPoints ?? []).length === maxItineraiesAllowed) {
      ticket.status = "redeemed";
      await ticket.save();
    }

    if (ticketUpdate.modifiedCount === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Ticket already scanned for this purpose.");
    }

    await sendKafkaMessage("ITINERARY_UPDATE_OPERATION", "itinerary", {
      operation: "PUSH",
      targetType: "SINGLE",
      field: "attendanceList",
      value: ticketData.boughtBy,
      itineraryId,
    });

    io.emit(`ticketScan_${ticketId}`, {
      itinerary: itineraryData.title,
    });

    return res
      .status(200)
      .json({ msg: "Ticket scan successful.", userInfo: userData });
  } catch (error) {
    console.error("checkPointScan error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
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
      req.user.id,
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
      req.user.id,
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
      `${razorpayKeyId}:${razorpayKeySecret}`,
    ).toString("base64")}`;

    const response = await axios.get(
      `https://api.razorpay.com/v1/payments/${paymentId}`,
      {
        headers: { Authorization: authHeader },
      },
    );

    return res.status(200).json({
      success: true,
      paymentDetails: response.data,
    });
  } catch (error) {
    console.error(
      "Error fetching Razorpay payment:",
      error.response?.data || error.message,
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
      mongoose.Types.ObjectId.isValid(id),
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
      },
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
      { type: 1, boughtBy: 1 },
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

    if (
      !searchBy ||
      typeof searchBy !== "object" ||
      !Object.keys(searchBy).length
    ) {
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

async function fetchPayments(paymentIds) {
  const authHeader = `Basic ${Buffer.from(
    `${process.env.RAZOR_PAY_KEY}:${process.env.RAZOR_PAY_SECRET}`,
  ).toString("base64")}`;

  const results = [];

  for (const paymentId of paymentIds) {
    try {
      const response = await axios.get(
        `https://api.razorpay.com/v1/payments/${paymentId}`,
        { headers: { Authorization: authHeader } },
      );
      results.push({ id: paymentId, status: "success", data: response.data });
    } catch (err) {
      results.push({
        id: paymentId,
        status: "error",
        error: err.response?.data || err.message,
      });
    }
  }

  return results;
}

//checking incomplete tickets
const checkIncompleteTickets = async (req, res) => {
  try {
    if (req.user.role !== "admin")
      return res.status(421).send("Something went wrong.");
    const matchedTickets = await Ticket.find({
      boughtBy: null,
      paymentId: { $exists: true },
      $or: [
        { refundRequested: { $exists: false } }, // missing
        { refundRequested: false }, // explicitly false
        { refundRequested: null }, // explicitly null
      ],
    });
    const paymentIds = matchedTickets.map((t) => t.paymentId);
    const paymentDetails = await fetchPayments(paymentIds);
    const finalData = paymentDetails.map((pd, index) => ({
      paymentId: paymentIds[index],
      phone: pd.data.contact,
      amtPaid: pd.data.amount / 100,
    }));
    return res.status(200).json({ found: matchedTickets.length, finalData });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Server error" });
  }
};

//fetch payment details
const fetchPaymentDetails = async (req, res) => {
  try {
    const { paymentId } = req.query;

    // Validate request
    if (!paymentId) {
      return res
        .status(400)
        .json({ error: "Missing required field: paymentId" });
    }

    // Call helper
    const payments = await fetchPayments([paymentId]);

    // Fetch ticket data
    const ticket = await Ticket.findOne({ paymentId });

    // Fetch event data
    const eventData = await fetchEventData({
      id: ticket.eventId,
      fields: ["platformFeeEnabled"],
    });

    if (!payments || payments.length === 0) {
      return res.status(404).json({ error: "Payment not found" });
    }

    return res.status(200).json({
      msg: "Payment details fetched successfully.",
      paymentDetail: {
        ...payments[0],
        couponId: ticket.couponId || null,
        refundRequested: ticket.refundRequested || false,
        refundStatus: ticket.refundStatus || null,
        refundId: ticket.refundId || null,
        platformFeeEnabled: eventData.platformFeeEnabled,
      },
    });
  } catch (error) {
    console.error("Error fetching payment details:", error.message || error);

    // Razorpay may give error response object, bubble it up
    if (error.statusCode) {
      return res
        .status(error.statusCode)
        .json({ error: error.error?.description || "Razorpay API error" });
    }

    return res.status(500).json({ error: "Internal server error" });
  }
};

/**
 * GET /searchMyTickets?userId=...&eventName=...&status=...&upcoming=true
 *
 * Returns all tickets bought by a user, enriched with event metadata.
 * Designed for the Starman AI service (internal token auth).
 *
 * Optional filters:
 *   - eventName : fuzzy match on event name
 *   - status    : exact match (active | redeemed | refunded | expired)
 *   - upcoming  : "true" → only tickets whose event date is in the future
 */
const searchMyTickets = async (req, res) => {
  try {
    const { userId, eventName, status, upcoming } = req.query;

    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "A valid userId query param is required." });
    }

    // ── 1. Fetch all tickets for this user ──
    const filter = { boughtBy: new mongoose.Types.ObjectId(userId) };
    if (status) filter.status = status;

    const tickets = await Ticket.find(filter, {
      _id: 1,
      eventId: 1,
      amtPaid: 1,
      status: 1,
      type: 1,
      generatedAt: 1,
    })
      .sort({ generatedAt: -1 })
      .lean();

    if (tickets.length === 0) {
      return res.status(StatusCodes.OK).json({ tickets: [], totalCount: 0 });
    }

    // ── 2. Batch-fetch event metadata for each unique eventId ──
    const uniqueEventIds = [
      ...new Set(tickets.map((t) => t.eventId.toString())),
    ];

    const eventMap = {};
    await Promise.all(
      uniqueEventIds.map(async (eid) => {
        const eventData = await fetchEventData({
          id: eid,
          fields: [
            "name",
            "eventDate",
            "eventEndDate",
            "place",
            "url",
            "status",
            "belongsTo",
            "startTime",
            "endTime",
          ],
        });
        if (eventData) eventMap[eid] = eventData;
      }),
    );

    // ── 3. Merge & apply optional filters ──
    let enriched = tickets.map((t) => {
      const evt = eventMap[t.eventId.toString()] || {};
      return {
        ticketId: t._id,
        eventId: t.eventId,
        eventName: evt.name || "Unknown event",
        eventDate: evt.eventDate || null,
        eventEndDate: evt.eventEndDate || null,
        startTime: evt.startTime || null,
        endTime: evt.endTime || null,
        eventPlace: evt.place || null,
        eventUrl: evt.url || null,
        eventStatus: evt.status || null,
        belongsTo: evt.belongsTo || null,
        type: t.type || null,
        amtPaid: t.amtPaid,
        ticketStatus: t.status,
        generatedAt: t.generatedAt,
      };
    });

    // Fuzzy match on event name
    if (eventName) {
      const regex = new RegExp(eventName, "i");
      enriched = enriched.filter((t) => regex.test(t.eventName));
    }

    // Only upcoming events (eventDate >= now)
    if (upcoming === "true") {
      const now = new Date();
      enriched = enriched.filter(
        (t) => t.eventDate && new Date(t.eventDate) >= now,
      );
    }

    return res
      .status(StatusCodes.OK)
      .json({ tickets: enriched, totalCount: enriched.length });
  } catch (error) {
    console.error("❌ Error in searchMyTickets:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while searching tickets." });
  }
};

const addMetaDataToTickets = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        error: "Unauthorized."
      });
    }

    const { uid, universeMetaData } = req.body;

    if (!uid || !universeMetaData) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: "Missing uid or universeMetaData."
      });
    }

    const tickets = await Ticket.find({
      uid: null,
      universeMetaData: null,
    });

    console.log("Tickets with !uid and !unvierseMetaData", tickets.length)

    tickets.forEach((ticket) => {
      ticket.uid = uid;
      ticket.universeMetaData = universeMetaData;
      ticket.save();
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Tickets updated successfully."
    });
  } catch (err) {
    console.error("❌ Error in addMetaDataToTickets:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: "Something went wrong"
    });
  }
}

const getMultipleTicketFieldsByIds = async (req, res) => {
  try {
    const { ticketIds, fields } = req.body;

    if (!ticketIds) {
      return res.status(400).json({ error: "Ticket IDs is required." });
    }

    if (!fields || !Array.isArray(fields)) {
      return res.status(400).json({ error: "An array of fields is required." });
    }

    // Convert array of fields to space-separated string for Mongoose projection
    const projection = fields.join(" ");

    let query = Ticket.find(
      {
        _id : {$in : ticketIds}
      });
    
    const tickets = await query.select(projection);

    if (!tickets) {
      return res.status(404).json({ error: "Tickets not found." });
    }

    return res.status(200).json({ tickets });
  } catch (error) {
    console.error("❌ Error in getMultipleTicketFieldsByIds:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong while fetching tickets.");
  }
};

const searchTickets = async (req, res) => {
  try {
    const { eventId, name = "", email = "", ticketType } = req.query;

    const event = await fetchEventData(
      {
        id : eventId,
        fields : [
          "bookedBy"
        ]
      }
    )

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
    }

    const tickets = await Ticket.aggregate([
      {
        $match: {
          _id: { $in: event.bookedBy },
          ...(ticketType && {
            $expr: {
              $eq: [
                { $trim: { input: "$type" } },
                ticketType.trim()
              ]
            }
          }),
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "boughtBy",
          foreignField: "_id",
          as: "userMetaData",
        },
      },
      {
        $unwind: "$userMetaData"
      },
      {
        $match: {
          "userMetaData.name": { $regex: name, $options: "i" },
          "userMetaData.email": { $regex: email, $options: "i" }
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
        }
      }
    ])
    return res.status(StatusCodes.OK).json(tickets);
  } catch (e) {
    console.error(e);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Something went wrong",
    });
  }
};

const getPhysicalCopyOfTicket = async (req, res) => {
  try {
    const { ticketId } = req.query;

    // Fetch ticket
    const ticket = await Ticket.findById(ticketId).lean();
    if (!ticket) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: "Ticket not found" });
    }

    // Fetch event data using interservice call
    const eventData = await fetchEventData({
      id: ticket.eventId,
      fields: [
        "name",
        "url",
        "belongsTo",
        "eventDate",
        "eventEndDate",
        "startTime",
        "endTime",
        "place",
      ],
    });

    if (!eventData) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: "Event not found" });
    }

    // Fetch payment details (if applicable)
    let paymentDetail = {};
    if (ticket.paymentId && ticket.paymentId !== "free") {
      const payments = await fetchPayments([ticket.paymentId]);
      if (payments && payments.length > 0) {
        paymentDetail = payments[0];
      }
    }

    // Prepare ticket data
    const ticketData = {
      id: ticket._id.toString(),
      eventName: eventData.name,
      organizer: eventData.belongsTo?.name || "N/A",
      imageUrl: eventData.url || null,
      date: formatEventDateRange(eventData.eventDate, eventData.eventEndDate),
      time: `${formatTimeStamp(eventData.startTime, true)} - ${formatTimeStamp(
        eventData.endTime,
        true
      )}`,
      venue: eventData.place,
      type: ticket.type,
      amount: ticket.amtPaid,
      mode: paymentDetail?.data?.method || "N/A",
      contact: paymentDetail?.data?.contact || "N/A",
      paymentId: paymentDetail?.data?.id || "N/A",
      paidAt: ticket.generatedAt,
    };

    // Generate and upload PDF
    const link = await generateSingleTicketPDFAndUpload(ticketData);

    return res.status(StatusCodes.OK).json({ msg: "Done", link });
  } catch (error) {
    console.error("Error generating ticket:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ msg: "Something went wrong." });
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
  getTicketFieldsByQuery,
  checkPointScan,
  checkIncompleteTickets,
  fetchPaymentDetails,
  searchMyTickets,
  addMetaDataToTickets,
  getMultipleTicketFieldsByIds,
  searchTickets,
  getPhysicalCopyOfTicket
};
