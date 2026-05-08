const { StatusCodes } = require("http-status-codes");
const Event = require("../models/event");
const {
  fetchItineraries,
  fetchNativeUserData,
  fetchTicketsByIds,
  fetchTicketTypesCount,
  fetchTicketFieldsById,
  fetchUserData,
  fetchNativeClubData,
  sendMail,
  fetchDetailedTicketsByIds,
  generateTicketPDFAndUpload,
  fetchReviewedTickets,
  getUserMetaMap,
  fetchRedeemedTicketsOfEvent,
  scheduleNotification,
  fetchTicketsBoughtByAUserOfAnEvent,
  generateEmailReportHtml,
  fetchMultipleClubsData,
  autoGenEventMemoryHTML,
  generateTicketExcelAndUpload,
  fetchAvailableCoupon,
  fetchTicketFieldsByQuery,
  fetchEventAdminsByFields,
  fetchMultipleTicketFieldsById,
  fetchClubFieldsById,
} = require("./utilControllers");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const schedule = require("node-schedule");
const { default: mongoose } = require("mongoose");
const axios = require("axios");
const { createChannelForEvent } = require("./channelControllers");
const OpenAI = require("openai");
const jwt = require("jsonwebtoken");

const openai = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
});

//MiddleWare
const isAuthorized = async (id, role, belongsTo, callSign) => {
  if (role === "admin") {
    return true;
  } else {
    if (belongsTo.type === "Club") {
      const club_query = {
        id: belongsTo.id,
        fields: ["adminId"],
        callSign,
      };
      const club = await fetchNativeClubData(club_query);
      const adminIds = club.adminId;
      if (adminIds.includes(id)) {
        return true;
      }
    }
    return false;
  }
};

function normalizeTicketVisibility(visibility = {}) {
  return {
    scope: visibility?.scope || "public",
    uids: Array.isArray(visibility?.uids) ? visibility.uids : [],
    n_uids: Array.isArray(visibility?.n_uids) ? visibility.n_uids : [],
    privateCodes: Array.isArray(visibility?.privateCodes)
      ? visibility.privateCodes
      : [],
    usersList: Array.isArray(visibility?.usersList) ? visibility.usersList : [],
  };
}

function normalizeRequiredTicketTypes(ticketTypes) {
  if (!Array.isArray(ticketTypes) || ticketTypes.length === 0) {
    return {
      error:
        "At least one ticket type is required. Use price 0 for a free event.",
    };
  }

  const normalizedTicketTypes = [];

  for (const ticket of ticketTypes) {
    const type = typeof ticket?.type === "string" ? ticket.type.trim() : "";
    const priceEmpty =
      ticket?.price === undefined ||
      ticket?.price === null ||
      (typeof ticket.price === "string" && ticket.price.trim() === "");
    const availableEmpty =
      ticket?.available === undefined ||
      ticket?.available === null ||
      (typeof ticket.available === "string" && ticket.available.trim() === "");
    const price = Number(ticket?.price);
    const available = Number(ticket?.available);

    if (!type) {
      return { error: "Ticket type name is required." };
    }

    if (priceEmpty || !Number.isFinite(price) || price < 0) {
      return { error: "Ticket price must be 0 or more." };
    }

    if (availableEmpty || !Number.isFinite(available) || available <= 0) {
      return { error: "Ticket availability must be greater than 0." };
    }

    normalizedTicketTypes.push({
      ...ticket,
      type,
      price,
      available,
      visibility: normalizeTicketVisibility(ticket.visibility),
    });
  }

  return { ticketTypes: normalizedTicketTypes };
}

async function ticketBuyResolver({
  accessLevel,
  clubId,
  userId,
  uids = [],
  n_uids = [],
  privateCodes = [],
  usersList = [],
  userUid,
  userPrivateCode,
}) {
  if (!accessLevel || accessLevel === "public") {
    if (n_uids.length > 0 && userUid && n_uids.includes(userUid)) {
      return {
        canBuy: false,
        message: "This ticket is not available for your universe.",
      };
    }

    return { canBuy: true, message: "You can buy ticket" };
  }

  if (accessLevel === "native") {
    if (!userUid || !uids.includes(userUid)) {
      return {
        canBuy: false,
        message: "This ticket is only available for selected universes.",
      };
    }

    return { canBuy: true, message: "You can buy ticket" };
  }

  if (accessLevel === "private_code") {
    const allowedCodes = privateCodes
      .map((code) =>
        String(code || "")
          .trim()
          .toUpperCase(),
      )
      .filter(Boolean);
    const submittedCode = String(userPrivateCode || "")
      .trim()
      .toUpperCase();

    if (!submittedCode || !allowedCodes.includes(submittedCode)) {
      return {
        canBuy: false,
        message: "A valid private code is required for this ticket.",
      };
    }

    return { canBuy: true, message: "You can buy ticket" };
  }

  if (accessLevel === "users_list") {
    const allowedUsers = new Set(usersList.map((value) => value?.toString()));
    const safeUserId = userId?.toString();

    if (!safeUserId || !allowedUsers.has(safeUserId)) {
      return {
        canBuy: false,
        message: "This ticket is restricted to selected users.",
      };
    }

    return { canBuy: true, message: "You can buy ticket" };
  }

  if (!clubId) {
    return {
      canBuy: false,
      message: "Club context is missing for this ticket.",
    };
  }

  const club = await fetchClubFieldsById({
    id: clubId,
    fields: ["mainAdmin", "adminId", "members", "team"],
  });

  if (!club) {
    return {
      canBuy: false,
      message: "Unable to verify club access for this ticket.",
    };
  }

  const safeUserId = userId?.toString();
  const mainAdmin = club.mainAdmin?.toString();
  const adminIds = new Set((club.adminId || []).map((id) => id?.toString()));
  const memberIds = new Set((club.members || []).map((id) => id?.toString()));
  const teamIds = new Set(
    (club.team || []).map((entry) => entry?.id?.toString()),
  );

  if (accessLevel === "club_full") {
    return mainAdmin === safeUserId
      ? { canBuy: true, message: "You can buy ticket" }
      : {
        canBuy: false,
        message: "This ticket is only available to the club owner.",
      };
  }

  if (accessLevel === "club_admin" || accessLevel === "club_admins") {
    return adminIds.has(safeUserId)
      ? { canBuy: true, message: "You can buy ticket" }
      : {
        canBuy: false,
        message: "This ticket is only available to club admins.",
      };
  }

  if (accessLevel === "club_core") {
    return teamIds.has(safeUserId)
      ? { canBuy: true, message: "You can buy ticket" }
      : {
        canBuy: false,
        message: "This ticket is only available to the club core team.",
      };
  }

  if (accessLevel === "club_members") {
    return memberIds.has(safeUserId)
      ? { canBuy: true, message: "You can buy ticket" }
      : {
        canBuy: false,
        message: "This ticket is only available to club members.",
      };
  }

  return {
    canBuy: false,
    message: "You are not authorized to buy this ticket.",
  };
}

const canBuyTicket = async (req, res) => {
  try {
    const {
      eventId,
      ticketType,
      privateCode,
      uid,
      userId: internalUserId,
    } = req.body;

    if (!eventId || !ticketType) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        canBuy: false,
        message: "Event ID and ticket type are required.",
      });
    }

    const event = await Event.findById(eventId, {
      ticketTypes: 1,
      belongsTo: 1,
    }).lean();

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        canBuy: false,
        message: "Event not found.",
      });
    }

    const type = (event.ticketTypes || []).find(
      (ticket) =>
        ticket.type === ticketType ||
        ticket._id?.toString() === ticketType?.toString(),
    );

    if (!type) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        canBuy: false,
        message: "Ticket type not found.",
      });
    }

    const resolvedUserId =
      req.user?.id || (req.internalService ? internalUserId : null);
    const resolvedUid = uid || req.user?.uid || null;

    if (!resolvedUserId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        canBuy: false,
        message: "User context is required to verify ticket access.",
      });
    }

    const visibility = normalizeTicketVisibility(type.visibility);
    const { canBuy, message } = await ticketBuyResolver({
      accessLevel: visibility.scope,
      clubId: event?.belongsTo?.id,
      userId: resolvedUserId,
      uids: visibility.uids,
      n_uids: visibility.n_uids,
      privateCodes: visibility.privateCodes,
      usersList: visibility.usersList,
      userUid: resolvedUid,
      userPrivateCode: privateCode,
    });

    return res.status(canBuy ? StatusCodes.OK : StatusCodes.FORBIDDEN).json({
      success: canBuy,
      canBuy,
      message,
    });
  } catch (error) {
    console.error("canBuyTicket error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      canBuy: false,
      message: "Something went wrong.",
    });
  }
};

//Controller 1
const createEvent = async (req, res) => {
  try {
    const requiredFields = [
      "url",
      "name",
      "description",
      "place",
      "startTime",
      "endTime",
      "eventDate",
      "eventEndDate",
      "belongsTo",
      "eventManagerMail",
      "eventManagerPhone",
      "universeMetaData",
    ];
    for (let field of requiredFields) {
      if (!req.body[field]) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .send(`Missing required field: ${field}`);
      }
    }

    const ticketValidation = normalizeRequiredTicketTypes(req.body.ticketTypes);
    if (ticketValidation.error) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: ticketValidation.error });
    }

    const event = await Event.create({
      ...req.body,
      ticketAvailable: true,
      ticketTypes: ticketValidation.ticketTypes,
      uid: req.user.uid,
    });
    
    console.log(`✅  [EVENT API] Event created successfully: ${event._id}`);

    // Auto-create MOU draft in mou service via internal API call
    try {
      console.log(`⏳  [EVENT API] Notifying MOU service to create draft for event ${event._id}...`);
      const internalToken = jwt.sign(
        { role: "internal", service: "event" },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: "5m" }
      );

      const mouResponse = await axios.post("http://mou:5065/mou/api/v1/admin/internal/draft", {
        eventId: event._id,
        clubId: event.belongsTo.id,
        creatorId: req.user.id,
        eventName: event.name,
        clubName: event.belongsTo.name,
        creatorName: req.user.name || "Event Creator",
        creatorEmail: req.user.email || "dummy@example.com",
        universityId: event.belongsTo.universeId
      }, {
        headers: { Authorization: `Bearer ${internalToken}` }
      });
      
      console.log(`✅  [EVENT API] MOU Draft created with ID: ${mouResponse.data.mou._id}`);
      
      // Save MOU ID back to event
      event.mouId = mouResponse.data.mou._id;
      await event.save();
    } catch (mouErr) {
      console.error("❌ [EVENT API] Failed to auto-create MOU draft:", mouErr.message);
      // Non-blocking, continue with event creation
    }

    // Auto-trigger channel creation (fire-and-forget — don't block the response)
    createChannelForEvent(event._id).catch((channelErr) =>
      console.error(
        "Auto channel creation failed (non-blocking):",
        channelErr.message,
      ),
    );

    return res.status(StatusCodes.CREATED).json({ event });
  } catch (error) {
    console.error("Error creating event:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to create event. " + error.message);
  }
};

const fetchRightSequence = async (events) => {
  try {
    const now = new Date();

    // Separate featured and old events
    const featuredEvents = events.filter((e) => e.status === "featured");
    const oldEvents = events.filter((e) => e.status !== "featured");

    // Get all club IDs from featured events
    const clubIds = featuredEvents.map((e) => e.belongsTo.id);

    // Fetch clubs with ratings
    const clubs = await fetchMultipleClubsData({
      ids: clubIds,
      fields: ["_id", "rating"],
    });

    // Create lookup for club ratings
    const clubRatings = {};
    clubs.forEach((club) => {
      clubRatings[club._id.toString()] = club.rating || 0;
    });

    // Sort featured events:
    // 1. Active promoted events first (promotionExpiry > now, isPromoted = true)
    // 2. Sort promoted by promotionLevel DESC, then clubRating DESC
    // 3. Then non-promoted events by clubRating DESC
    const sortedFeaturedEvents = featuredEvents.sort((a, b) => {
      const ratingA = clubRatings[a.belongsTo.id] || 0;
      const ratingB = clubRatings[b.belongsTo.id] || 0;

      const aIsActivePromotion =
        a.isPromoted && a.promotionExpiry && new Date(a.promotionExpiry) > now;
      const bIsActivePromotion =
        b.isPromoted && b.promotionExpiry && new Date(b.promotionExpiry) > now;

      if (aIsActivePromotion && !bIsActivePromotion) return -1; // a first
      if (!aIsActivePromotion && bIsActivePromotion) return 1; // b first

      if (aIsActivePromotion && bIsActivePromotion) {
        // Compare promotionLevel first
        if (b.promotionLevel !== a.promotionLevel) {
          return b.promotionLevel - a.promotionLevel;
        }
        // If promotionLevel equal → fallback to rating
        return ratingB - ratingA;
      }

      // If neither promoted → fallback to rating
      return ratingB - ratingA;
    });

    // Final sequence: featured (sorted) first, then old events (untouched)

    return [...sortedFeaturedEvents, ...oldEvents];
  } catch (error) {
    console.log(error);
    return [];
  }
};

//Controller 2
const getAllEvents = async (req, res) => {
  try {
    const { status, batch = 1, batchSize = 6 } = req.query;

    const excludedBelongsToIds = [
      "657b9303f18136e2f692398c",
      "657b97a8f18136e2f69239ab",
      "67406a24759b2a80fd8f60c3",
      "687f6e7bbb8addf5fa0ea0d1",
      "66d29ec57657f2d4231cd22a",
    ];

    let events;

    if (status) {
      events = await Event.aggregate([
        { $match: { status } },
        {
          $addFields: {
            bookedByCount: {
              $cond: {
                if: { $in: ["$belongsTo.id", excludedBelongsToIds] }, // condition based on belongsTo.id
                then: null, // or 0 if you prefer numeric
                else: { $size: { $ifNull: ["$bookedBy", []] } },
              },
            },
          },
        },
        {
          $project: {
            bookedBy: 0, // same exclusions as before
            amtPaid: 0,
            amtPaidTo: 0,
            ticketSellingDays: 0,
            cumulativeRevenue: 0,
            courseAnalytics: 0,
            faq: 0,
          },
        },
      ]);
    } else {
      events = await Event.aggregate([
        { $match: { eventDate: { $gte: new Date() } } },
        {
          $addFields: {
            isFeatured: { $cond: [{ $eq: ["$status", "featured"] }, 1, 0] },
          },
        },
        {
          $sort: {
            isFeatured: -1, // featured first
            eventDate: 1, // then earliest date
          },
        },
        { $project: { bookedBy: 0, isFeatured: 0 } }, // hide helper field
      ]);

      let finalEvents = events;
      if (finalEvents.length < batchSize) {
        const remaining = batchSize - finalEvents.length;
        const pastEvents = await Event.aggregate([
          { $match: { eventDate: { $lt: new Date() } } },
          { $sort: { eventDate: -1 } },
          { $limit: remaining },
          { $project: { bookedBy: 0 } },
        ]);
        finalEvents = [...events, ...pastEvents];
      }
      events = await fetchRightSequence(finalEvents);
    }

    // Collect all unique itinerary IDs from the events
    const allItineraryIds = events.flatMap((event) => event.itineraries || []);

    // Fetch itineraries from the external service
    const itinerariesMap = {};
    const itineraries = await fetchItineraries({
      itineraryIds: allItineraryIds,
    });

    // Convert to map for fast access
    itineraries.forEach((it) => {
      itinerariesMap[it._id] = it;
    });

    // Attach itineraries to events
    const eventsWithItineraries = events.map((event) => {
      const enrichedItineraries = (event.itineraries || [])
        .map((id) => itinerariesMap[id] || null)
        .filter(Boolean);
      return {
        ...event.toObject(),
        itineraries: enrichedItineraries,
      };
    });

    return res.status(StatusCodes.OK).json(eventsWithItineraries.reverse());
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "An error occurred while fetching events." });
  }
};

//Controller 3
const allowedStatuses = [
  "pending",
  "featured",
  "past and unclear",
  "past and clear",
  "postponed",
  "expired"
];

//Controller 4
const changeEventStatus = async (req, res) => {
  if (req.user?.role !== "admin") {
    return res
      .status(StatusCodes.FORBIDDEN)
      .send("You are not authorized to change the status of the event!");
  }

  const { status, id } = req.query;

  if (!status || !id) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("Missing required 'status' or 'id' query parameter.");
  }

  if (!allowedStatuses.includes(status)) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send(`Invalid status value: '${status}'.`);
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
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Event not found with provided ID.");
    }

    event.status = status;
    await event.save();

    // Send Kafka message only if status is 'featured'
    if (status === "featured") {
      await sendKafkaMessage("FEATURED_SECONDARY_ACTION", "universe", {
        clubId: event.belongsTo.id,
        eventId: id,
        eventName: event.name,
        eventPoster: event.url,
        eventManagerMail: event.eventManagerMail,
      });
    }

    return res
      .status(StatusCodes.OK)
      .send("Event status changed successfully.");
  } catch (error) {
    console.error("Error changing event status:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 5
const deleteEvent = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to delete the event.");
    }

    const { eventId } = req.body;

    if (!eventId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Event ID must be provided.");
    }

    const deletedEvent = await Event.findByIdAndDelete(eventId);

    if (!deletedEvent) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Event not found or already deleted.");
    }

    return res.status(StatusCodes.OK).json({
      msg: "Event deleted successfully.",
      deletedEvent,
    });
  } catch (error) {
    console.error("❌ Error deleting event:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while deleting the event.");
  }
};

//Controller 6
const getTicketsBought = async (req, res) => {
  try {
    const userId = req.query.userId || req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const user_query = {
      id: userId,
      fields: ["ticketsBought"],
      callSign: "universe",
    };
    const user = await fetchNativeUserData(user_query);

    if (!user || !user.ticketsBought || !user.ticketsBought.length) {
      return res.status(StatusCodes.OK).json({ arr: [], length: 0 });
    }

    const allTicketIds = user.ticketsBought;
    // Reverse them first to show latest tickets first, matching previous behaviour
    const reversedTicketIds = [...allTicketIds];

    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedTicketIds = reversedTicketIds.slice(startIndex, endIndex);

    if (paginatedTicketIds.length === 0) {
      return res
        .status(StatusCodes.OK)
        .json({ arr: [], length: allTicketIds.length });
    }

    const tickets = await fetchTicketsByIds({ ticketIds: paginatedTicketIds });

    if (!Array.isArray(tickets) || tickets.length === 0) {
      return res
        .status(StatusCodes.OK)
        .json({ arr: [], length: allTicketIds.length });
    }

    const ticketMap = {};
    for (const ticket of tickets) {
      if (ticket && ticket._id) {
        ticketMap[ticket._id.toString()] = ticket;
      }
    }

    const eventIds = tickets.map((ticket) => ticket.eventId);
    const events = await Event.find(
      { _id: { $in: eventIds } },
      {
        bookedBy: 0,
        cumulativeRevenue: 0,
        ticketSellingDays: 0,
        courseAnalytics: 0,
        faq: 0,
      },
    ).lean();

    const eventMap = {};
    for (const event of events) {
      if (event && event._id) {
        eventMap[event._id.toString()] = event;
      }
    }

    const arr = paginatedTicketIds
      .map((ticketId) => {
        const ticket = ticketMap[ticketId?.toString()];
        if (!ticket) return null;

        const actualEvent = eventMap[ticket.eventId?.toString()];
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
      .json({ arr, length: allTicketIds.length });
  } catch (error) {
    console.error("Error in getTicketsBought:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//helper function to convert "2024-03-12" into 12 Mar
function formatDate(inputDate) {
  const dateParts = inputDate.split("-");
  const year = parseInt(dateParts[0]);
  const month = parseInt(dateParts[1]) - 1;
  const day = parseInt(dateParts[2]);
  const dateObject = new Date(year, month, day);
  const formattedDate = dateObject.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
  });
  return formattedDate;
}

//Controller 7
const getEventAnalytics = async (req, res) => {
  const { eventId } = req.query;
  try {
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
    }

    const canSeeStats = Array.isArray(event.permissions?.whoCanSeeStats)
      ? event.permissions.whoCanSeeStats.includes(req.user.id)
      : false;

    if (!canSeeStats && req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        msg: "You do not have access",
      });
    }

    // Revenue graph data
    const revenue = event.cumulativeRevenue || [];
    const dates = event.ticketSellingDays || [];
    const graphData = revenue.map((value, i) => ({
      value,
      dataPointText: `₹${value}`,
      label: formatDate(dates[i] || new Date()),
    }));

    // Course analytics (Top 3)
    const courseAnalytics = event.courseAnalytics || [];
    const sortedCourses = [...courseAnalytics].sort(
      (a, b) => b.count - a.count,
    );
    const courseAnalyticsData = sortedCourses
      .slice(0, 3)
      .map(({ course, count }) => ({
        value: count,
        text: course,
      }));

    // Ticket sales
    const ticketSold = event.bookedBy?.length || 0;
    const ticketIds = event.bookedBy || [];
    const ticketTypes = (event.ticketTypes || []).map((t) => t.type.trim());

    // Fetch ticket type counts from DB
    const ticketCounts = await fetchTicketTypesCount({ ticketIds });

    // Match ticket counts by type
    const ticketTypesSales = ticketTypes.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {});
    ticketCounts.forEach(({ _id, count }) => {
      const type = _id?.trim();
      if (type && ticketTypesSales.hasOwnProperty(type)) {
        ticketTypesSales[type] = count;
      }
    });

    return res.status(StatusCodes.OK).json({
      graphData,
      courseAnalyticsData,
      ticketSold,
      ticketTypesSales,
    });
  } catch (error) {
    console.error("❌ Error in getEventAnalytics:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 8
const getCustomAnalytics = async (req, res) => {
  const { mode, eventId } = req.query;
  try {
    const event = await Event.findById(eventId);
    const bookedBy = event.bookedBy;
    const len = bookedBy.length;

    let UG = 0,
      PG = 0,
      PhD = 0;
    let yearArr = Array.from({ length: 4 }, (_, i) => ({
      text: new Date().getFullYear() + i,
      value: 0,
    }));

    const ticketPromises = bookedBy.map((ticketId) =>
      fetchTicketFieldsById({ ticketId, fields: [] }),
    );
    const tickets = await Promise.all(ticketPromises);

    const userPromises = tickets.map((ticket) =>
      fetchUserData({ id: ticket.boughtBy, fields: ["level", "passoutYear"] }),
    );
    const users = await Promise.all(userPromises);

    for (const user of users) {
      if (mode === "Level") {
        switch (user.level) {
          case "UG":
            UG++;
            break;
          case "PG":
            PG++;
            break;
          case "PhD":
            PhD++;
            break;
        }
      } else if (mode === "Year") {
        const passoutYear = user.passoutYear;
        const index = passoutYear - new Date().getFullYear();
        if (index >= 0 && index < yearArr.length) {
          yearArr[index].value++;
        } else {
          console.warn(
            `User ${user._id} has invalid passoutYear ${passoutYear}`,
          );
        }
      }
    }

    if (mode === "Level") {
      return res.status(StatusCodes.OK).json([
        { value: UG, text: "UnderGraduate" },
        { value: PG, text: "PostGraduate" },
        { value: PhD, text: "Research Scholar" },
      ]);
    } else if (mode === "Year") {
      return res.status(StatusCodes.OK).json(yearArr);
    }
  } catch (error) {
    console.error("Custom Analytics Error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 9
const addPredefinedQues = async (req, res) => {
  const { ques, ans, eventId, faqId } = req.body;

  try {
    const event = await Event.findById(eventId, { belongsTo: 1, faq: 1 });
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event.belongsTo,
      "universe",
    );

    if (!ques || !ans || !authorized) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Either insufficient data or not authorized.");
    }

    const dataPoint = {
      id: Date.now().toString(36) + Math.random().toString(36).substring(2, 7),
      ques,
      ans,
      predefined: true,
      setAsPredefined: false,
    };

    // Insert new FAQ at the start
    event.faq.unshift(dataPoint);

    // Set previous FAQ as predefined if `faqId` is given
    if (faqId) {
      event.faq = event.faq.map((f) =>
        f.id?.toString() === faqId
          ? { ...f.toObject(), setAsPredefined: true }
          : f,
      );
    }

    await event.save();
    return res.status(StatusCodes.OK).send("FAQ updated successfully.");
  } catch (error) {
    console.error("Add Predefined FAQ Error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 10
const removePredefinedQues = async (req, res) => {
  const { faqId, eventId, ques } = req.body;

  try {
    if (!faqId || !eventId || !ques) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Missing required fields.");
    }

    const event = await Event.findById(eventId, { belongsTo: 1, faq: 1 });
    const authorized = await isAuthorized(
      req.user.id,
      req.user.role,
      event?.belongsTo,
      "universe",
    );

    if (!authorized) {
      return res.status(StatusCodes.FORBIDDEN).send("Not authorized.");
    }

    let foundIndex = -1;

    for (let i = 0; i < event.faq.length; i++) {
      const faq = event.faq[i];

      if (faq.id === faqId) {
        // Mark as not predefined
        faq.setAsPredefined = false;
      } else if (faq.ques === ques) {
        // Identify duplicate question to delete
        foundIndex = i;
      }
    }

    if (foundIndex !== -1) {
      event.faq.splice(foundIndex, 1);
    }

    await event.save();

    return res
      .status(StatusCodes.OK)
      .send("Predefined question removed successfully.");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 11
const askQuestion = async (req, res) => {
  const { eventId, ques } = req.body;

  try {
    if (!eventId || !ques) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Missing event ID or question.");
    }

    const event = await Event.findById(eventId, {
      faq: 1,
      eventManagerMail: 1,
      name: 1,
    });

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
    }

    const user_query = {
      id: req.user.id,
      fields: ["name", "image", "_id", "pushToken"],
    };

    const user = await fetchUserData(user_query);

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
    await event.save(); // Ensure save is awaited

    // Scheduling a job to notify the event manager
    const threeSecLater = new Date(Date.now() + 3000); // 3 seconds later

    schedule.scheduleJob(
      `questionAsked_${Date.now()}_${req.user.id}`, // Avoid using full Date object in name
      threeSecLater,
      async () => {
        try {
          const intro = [
            `A new question was submitted on the FAQ portal for ${event.name}:`,
            `"${ques}"`,
            "Please review and respond at your earliest convenience.",
          ];

          const outro =
            "This email contains confidential information. If you are not the intended recipient, please disregard it.";
          const subject = `New Question for ${event.name}`;
          const destination = [event.eventManagerMail];
          const name = "Event Manager";

          const { ses, params } = await sendMail(
            name,
            intro,
            outro,
            subject,
            destination,
          );
          await ses.sendEmail(params).promise();
        } catch (emailError) {
          console.error(
            "Failed to send FAQ notification email:",
            emailError.message,
          );
        }
      },
    );

    return res.status(StatusCodes.OK).json({ dataPoint });
  } catch (error) {
    console.error("Error in askQuestion:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 12
const answerTheQuestion = async (req, res) => {
  const { eventId, ans, faqId } = req.body;

  try {
    if (!eventId || !ans || !faqId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Missing eventId, faqId, or answer.");
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
    }

    const authorized = Array.isArray(event.permissions?.whoCanAnswerFAQ)
      ? event.permissions.whoCanAnswerFAQ.includes(req.user.id)
      : false;

    if (!authorized) {
      return res.status(StatusCodes.FORBIDDEN).send("Not authorized.");
    }

    const user_query = {
      id: req.user.id,
      fields: ["name", "image", "_id", "pushToken"],
    };
    const user = await fetchUserData(user_query);

    let dataPointToReturn = null;

    for (let i = 0; i < event.faq.length; i++) {
      const faqItem = event.faq[i];
      if (faqItem.id === faqId) {
        const seeker = await fetchUserData({
          id: faqItem.seekerDetail.id,
          fields: ["email", "name", "image", "pushToken"],
        });

        // Update fields directly
        faqItem.ans = ans;
        faqItem.answererDetail = {
          name: user.name,
          image: user.image,
          pushToken: user.pushToken,
          position: "Event Manager",
        };

        dataPointToReturn = faqItem;

        // Schedule notification (same as before...)
        const threeSecLater = new Date(Date.now() + 3000);

        schedule.scheduleJob(
          `answered_${Date.now()}_${req.user.id}`,
          threeSecLater,
          async () => {
            try {
              const intro = [
                `Your question on the FAQ portal for ${event.name} has been answered.`,
                `"${faqItem.ques}"`,
                `Answer: "${ans}"`,
                "We hope this resolves your query.",
              ];

              const { ses, params } = await sendMail(
                seeker.name,
                intro,
                "This email contains confidential info. If you are not the intended recipient, ignore it.",
                `Your question about ${event.name} has been answered`,
                [seeker.email],
              );

              await ses.sendEmail(params).promise();

              scheduleNotification(
                [seeker.pushToken],
                `Your question on ${event.name} was answered`,
                `Check out the FAQ section for the reply.`,
              );
            } catch (notifyErr) {
              console.error("Error notifying the seeker:", notifyErr.message);
            }
          },
        );

        break; // only update one
      }
    }

    if (!dataPointToReturn) {
      return res.status(StatusCodes.NOT_FOUND).send("FAQ item not found.");
    }

    await event.save();

    return res.status(StatusCodes.OK).json({ dataPoint: dataPointToReturn });
  } catch (error) {
    console.error("Error answering the question:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 13
const getFaq = async (req, res) => {
  const { eventId } = req.query;

  try {
    const event = await Event.findById(eventId, {
      faq: 1,
      belongsTo: 1,
      permissions: 1,
    });
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
    }

    const authorized = event.permissions?.whoCanAnswerFAQ.includes(req.user.id);

    const predefined = event.faq.filter((faq) => faq.predefined);
    const generalQuestion = event.faq.filter((faq) => !faq.predefined);

    return res
      .status(StatusCodes.OK)
      .json({ predefined, generalQuestion, authorized });
  } catch (error) {
    console.error("Error in getFaq:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 14
const changeStatusJob = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(StatusCodes.FORBIDDEN).send("Access denied.");
  }

  try {
    const updateExpiredEvents = async () => {
      const featuredEvents = await Event.find({ status: "featured" });

      for (let event of featuredEvents) {
        const now = new Date();
        const eventTime = new Date(event.eventDate);

        if (eventTime < now) {
          event.status = "past and unclear";
          await event.save();
        }
      }
    };

    // Run once immediately
    await updateExpiredEvents();

    // Schedule to run daily at midnight
    const jobSchedule = "0 0 * * *"; // every day at 00:00
    schedule.cancelJob("expireEvent"); // cancel existing if any

    schedule.scheduleJob("expireEvent", jobSchedule, updateExpiredEvents);

    return res
      .status(StatusCodes.OK)
      .send("All event status updated and job scheduled successfully.");
  } catch (error) {
    console.error("Error scheduling job:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to schedule status update job.");
  }
};

//Controller 15
const getTickets = async (req, res) => {
  try {
    const projection = {
      courseAnalytics: 0,
      cumulativeRevenue: 0,
      ticketSellingDays: 0,
      amtPaid: 0,
      amtPaidTo: 0,
    };

    const featuredEvents = await Event.find(
      {
        status: "featured",
        ticketAvailable: true,
        eventDate: { $gte: new Date() },
      },
      projection,
    );

    const expiredEvents = await Event.find(
      {
        status: "past and unclear",
        ticketAvailable: true,
      },
      projection,
    ).limit(2);

    const attachItineraries = async (events) => {
      for (let event of events) {
        if (Array.isArray(event.itineraries) && event.itineraries.length > 0) {
          try {
            const itineraryDetails = await fetchItineraries({
              itineraryIds: event.itineraries,
            });
            event = event.toObject(); // convert Mongoose doc to plain object
            event.itineraryDetails = itineraryDetails;
          } catch (e) {
            console.error(
              `Failed to fetch itineraries for event ${event._id}`,
              e.message,
            );
            event = event.toObject();
            event.itineraryDetails = [];
          }
        } else {
          event = event.toObject();
          event.itineraryDetails = [];
        }
      }
    };

    await attachItineraries(featuredEvents);
    await attachItineraries(expiredEvents);

    return res.status(StatusCodes.OK).json({
      featuredEvents,
      expiredEvents,
    });
  } catch (error) {
    console.error("Error in getTickets:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 16
const generateTicketListPdf = async (req, res) => {
  try {
    const { eventId, format = "PDF file" } = req.query;

    if (!eventId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Please provide an event ID.");
    }

    const event = await Event.findById(eventId).populate("belongsTo");
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
    }

    // Authorization check
    const hasAccess = await isAuthorized(
      req.user.id,
      "user",
      event.belongsTo._id || event.belongsTo,
      "universe",
    );

    if (!hasAccess) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to access this data.");
    }

    // Guard against no ticket data
    const ticketIds = event.bookedBy || [];
    const ticketsSold = ticketIds.length;

    if (ticketsSold === 0) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("No tickets have been booked for this event yet.");
    }

    // Build revenue graph
    const revenue = event.cumulativeRevenue || [];
    const dates = event.ticketSellingDays || [];
    let totalRevenue = 0;

    const graphData = revenue.map((value, i) => {
      const amount = Number(value) || 0;
      totalRevenue += amount;

      return {
        value: amount,
        dataPointText: `₹${amount}`,
        label: formatDate(dates[i]) || `Day ${i + 1}`,
      };
    });

    // Fetch ticket details
    const query = { ticketIds };
    const tickets = await fetchDetailedTicketsByIds(query);

    // Generate and upload PDF
    let pdfUrl;
    if (format === "PDF file") {
      try {
        pdfUrl = await generateTicketPDFAndUpload({
          tickets,
          eventName: event.name,
          graphData,
          totalRevenue,
          totalTicketsSold: ticketsSold,
          clubName: event.belongsTo?.name || "Unknown Club",
        });
      } catch (pdfError) {
        console.error("PDF generation failed:", pdfError);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send("Could not generate PDF report.");
      }
    }

    let excelUrl = "";

    if (format === "Excel file") {
      excelUrl = await generateTicketExcelAndUpload({
        tickets: tickets,
        eventName: event.name,
        graphData,
        totalRevenue,
        totalTicketsSold: ticketsSold,
        clubName: event.belongsTo.name,
      });
    }

    console.log("PDF report generated:", pdfUrl);
    return res
      .status(StatusCodes.OK)
      .json({ reportURL: format === "PDF file" ? pdfUrl : excelUrl });
  } catch (error) {
    console.error("Error in generating ticket list PDF:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

//Controller 17
const getReviews = async (req, res) => {
  try {
    const { eventId, batch = 1, batchSize = 10 } = req.query;

    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).send("Event ID is required.");
    }

    const skip = (parseInt(batch) - 1) * parseInt(batchSize);
    const limit = parseInt(batchSize);

    const query = {
      eventId,
      skip,
      limit,
    };

    // Step 1: Fetch reviews with pagination
    const reviews = await fetchReviewedTickets(query);

    // Step 2: Extract unique userIds
    const userIds = [...new Set(reviews.map((r) => r.boughtBy.toString()))];

    // Step 3: Get user meta data map
    const userMap = await getUserMetaMap(userIds, [
      "name",
      "reg",
      "image",
      "course",
      "pushToken",
      "interests",
    ]);

    // Step 4: Attach user info to reviews
    const finalData = reviews.map((review) => ({
      ...review,
      userInfo: userMap[review.boughtBy.toString()] || null,
    }));

    return res.status(StatusCodes.OK).json(finalData);
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 18
const checkTicketAvailability = async (req, res) => {
  try {
    const { eventId, slug } = req.query;

    let query = {};
    if (eventId) {
      query._id = eventId;
    } else if (slug) {
      query.slug = slug;
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "eventId or slug is required.",
      });
    }

    const event = await Event.findOne(query, {
      bookedBy: 1,
      ticketTypes: 1,
      itineraries: 1,
    });

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
    }

    // Fetch and map itineraries
    const itineraryIds = event.itineraries || [];
    const itineraries = await fetchItineraries({ itineraryIds });

    const itinerariesMap = {};
    itineraries.forEach((it) => {
      itinerariesMap[it._id] = it;
    });

    const enrichedItineraries = itineraryIds.map(
      (id) => itinerariesMap[id] || null,
    );

    // Initialize ticket type sales
    const ticketTypes = event.ticketTypes.map((ticket) => ticket.type.trim());
    const ticketTypesSales = ticketTypes.reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {});

    const ticketCounts = await fetchTicketTypesCount({
      ticketIds: event.bookedBy || [],
    });

    console.log("ticket counts", ticketCounts);

    ticketCounts.forEach(({ type, count }) => {
      if (type !== null && ticketTypesSales.hasOwnProperty(type.trim())) {
        ticketTypesSales[type.trim()] = count;
      }
    });

    const coupons = await fetchAvailableCoupon({
      eventId,
      userId: req.user.id,
    });

    return res
      .status(StatusCodes.OK)
      .json({ ticketTypesSales, itineraries: enrichedItineraries, coupons });
  } catch (error) {
    console.error("checkTicketAvailability error:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 19
const checkLiveAttendance = async (req, res) => {
  try {
    const { eventId } = req.query;

    const event = await Event.findById(eventId, {
      bookedBy: 1,
      ticketTypes: 1,
    });

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
    }

    const ticketTypes = event.ticketTypes || [];

    const ticketTypesEntrance = ticketTypes.reduce((acc, ticket) => {
      if (ticket.type) {
        acc[ticket.type.trim()] = [];
      }
      return acc;
    }, {});

    const tickets = await fetchRedeemedTicketsOfEvent({ eventId });

    const userPromises = tickets.map((ticket) =>
      fetchUserData({
        id: ticket.boughtBy,
        fields: ["name", "image", "reg"],
      })
        .then((userInfo) => {
          if (!userInfo) {
            console.warn(`User not found for ID: ${ticket.boughtBy}`);
          }
          return userInfo;
        })
        .catch((error) => {
          console.error(
            `Error fetching user with ID: ${ticket.boughtBy}`,
            error,
          );
          return null;
        }),
    );

    const users = await Promise.all(userPromises);

    tickets.forEach((ticket, index) => {
      const userInfo = users[index];
      const typeKey = ticket.type?.trim();
      if (userInfo && typeKey && ticketTypesEntrance[typeKey]) {
        ticketTypesEntrance[typeKey].push(userInfo);
      }
    });

    return res.status(StatusCodes.OK).json(ticketTypesEntrance);
  } catch (error) {
    console.error("❌ checkLiveAttendance error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 20
const askForReviewSubmission = async (req, res) => {
  try {
    const { eventId } = req.query;

    const event = await Event.findById(eventId, {
      bookedBy: 1,
      name: 1,
      url: 1,
    });

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
    }

    const allTickets = await fetchTicketsByIds({ ticketIds: event.bookedBy });

    const notReviewedTickets = allTickets.filter(
      (ticket) => !ticket.reviewMsg || ticket.reviewMsg === null,
    );

    const notReviewedUserIds = notReviewedTickets.map(
      (ticket) => ticket.boughtBy,
    );

    const notReviewedUserMetaMap = await getUserMetaMap(notReviewedUserIds, [
      "_id",
      "email",
      "pushToken",
      "name",
      "image",
      "universeMetaData",
    ]);

    const notReviewedTicketsUserDetails = notReviewedTickets
      .map((ticket) => {
        const matchedUserMetaData = notReviewedUserMetaMap[ticket.boughtBy];
        if (!matchedUserMetaData) return null;
        return {
          pushToken: matchedUserMetaData.pushToken,
          email: matchedUserMetaData.email,
          name: matchedUserMetaData.name,
          image: matchedUserMetaData.image,
          userId: matchedUserMetaData._id,
          universeMetaData: matchedUserMetaData.universeMetaData,
        };
      })
      .filter(Boolean); // filter out nulls

    for (let notReviewedUser of notReviewedTicketsUserDetails) {
      // Kafka
      await sendKafkaMessage(
        "ASK_FOR_REVIEW",
        notReviewedUser.universeMetaData.callSign,
        {
          userId: notReviewedUser.userId,
          eventName: event.name,
          eventPoster: event.url,
        },
      );

      // Push Notification
      // scheduleNotification(
      //   [notReviewedUser.pushToken],
      //   `Hi ${notReviewedUser.name}`,
      //   `How was your experience at ${event.name}? Please review it on your tickets console.`
      // );

      // Email
      const intro = [
        `How was your experience at ${event.name}?`,
        `Please review it by visiting your tickets section.`,
      ];
      const outro = "We will see you at the next event.";
      const subject = `Review event ${event.name}`;
      const destination = [notReviewedUser.email];
      const name = `${notReviewedUser.name}`;

      const { ses, params } = await sendMail(
        name,
        intro,
        outro,
        subject,
        destination,
      );

      // ses.sendEmail(params, function (err, data) {
      //   if (err) {
      //     console.log('❌ SES Error:', err, err.stack);
      //   }
      // });
    }

    return res.status(StatusCodes.OK).json({
      msg: "Notifications for event review dispatched.",
      notReviewedTicketsUserDetails,
    });
  } catch (error) {
    console.error("❌ Error in askForReviewSubmission:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 21
const getAllTicketsBought = async (req, res) => {
  const { eventId, batch = 1, batchSize = 12 } = req.query;

  const actualBatchSize = parseInt(batchSize, 10);
  const batchNum = parseInt(batch, 10);

  if (!mongoose.Types.ObjectId.isValid(eventId)) {
    return res.status(StatusCodes.BAD_REQUEST).send("Invalid eventId.");
  }

  if (isNaN(actualBatchSize) || actualBatchSize <= 0) {
    return res.status(StatusCodes.BAD_REQUEST).send("Invalid batch size.");
  }

  if (isNaN(batchNum) || batchNum < 1) {
    return res.status(StatusCodes.BAD_REQUEST).send("Invalid batch number.");
  }

  const skip = (batchNum - 1) * actualBatchSize;

  try {
    const [event] = await Event.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(eventId) } },
      {
        $project: {
          bookedBy: { $slice: ["$bookedBy", skip, actualBatchSize] },
          _id: 0,
        },
      },
    ]);

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
    }

    const tickets = await fetchDetailedTicketsByIds({
      ticketIds: event.bookedBy,
    });

    return res.status(StatusCodes.OK).json(tickets);
  } catch (error) {
    console.error("❌ Error fetching tickets bought:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Cannot fetch tickets bought.");
  }
};

//Controller 22
const getEvents = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = parseInt(req.query.skip, 10) || 0;

    if (limit < 1 || limit > 100) {
      return res.status(400).send("Limit must be between 1 and 100.");
    }

    const events = await Event.find(
      {},
      {
        _id: 1,
        name: 1,
        slug: 1,
        belongsTo: 1,
        url: 1,
        eventDate: 1,
        description: 1,
        startTime: 1,
        endTime: 1,
        place: 1,
        status: 1,
        primaryCategory: 1,
        secondaryCategories: 1,
      },
    )
      .sort({ eventDate: -1 })
      .skip(skip)
      .limit(limit);

    return res.status(200).json(events);
  } catch (error) {
    console.error("❌ Error fetching events:", error.message);
    return res.status(500).send("An error occurred while fetching events.");
  }
};

//Controller 23
const checkEventStatus = async (req, res) => {
  try {
    const { eventId, slug } = req.query;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(StatusCodes.BAD_REQUEST).send("Invalid eventId.");
    }

    let query = {};

    if (eventId) {
      query._id = eventId;
    } else if (slug) {
      query.slug = slug;
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "eventId or slug is required.",
      });
    }

    const defaultResponse = {
      status: "expired",
      ticketAvailable: false,
      alreadyBooked: false,
      ticketType: null,
      ticketId: null,
      hasAdminAccess: false,
    };

    const event = await Event.findOne(query, {
      bookedBy: 0,
      cumulativeRevenue: 0,
      courseAnalytics: 0,
      faq: 0,
      ticketSellingDays: 0,
    });

    if (!event) {
      return res.status(StatusCodes.OK).json(defaultResponse);
    }

    const club = await fetchNativeClubData({
      id: event.belongsTo.id,
      fields: ["adminId", "mainAdmin"],
      callSign: "universe",
    });

    if (!club) {
      return res.status(StatusCodes.OK).json(defaultResponse);
    }

    const user = await fetchNativeUserData({
      id: req.user.id,
      fields: ["ticketsBought"],
      callSign: "universe",
    });

    const hasAdminAccess =
      Array.isArray(club.adminId) && club.adminId.includes(req.user.id);

    if (
      !user ||
      !Array.isArray(user.ticketsBought) ||
      user.ticketsBought.length === 0
    ) {
      return res.status(StatusCodes.OK).json({
        status: event.status,
        ticketAvailable: event.ticketAvailable,
        alreadyBooked: false,
        ticketType: null,
        ticketId: null,
        hasFullAccess: false,
        hasAdminAccess: false,
        canSeeStats: false,
        canScanTickets: false,
        canEditEvent: false,
        canAnswerFAQ: false,
        eventData: event,
      });
    }

    const matchedTicket = await fetchTicketsBoughtByAUserOfAnEvent({
      eventId,
      userId: req.user.id,
    });

    return res.status(StatusCodes.OK).json({
      status: event.status,
      ticketAvailable: event.ticketAvailable,
      alreadyBooked: !!matchedTicket,
      ticketType: matchedTicket?.type || null,
      ticketId: matchedTicket?._id || null,
      hasAdminAccess,
      hasFullAccess: club.mainAdmin === req.user.id,
      canSeeStats: (event.permissions.whoCanSeeStats || []).includes(
        req.user.id,
      ),
      canScanTickets: (event.permissions.whoCanScanTickets || []).includes(
        req.user.id,
      ),
      canEditEvent: (event.permissions.whoCanEditEvent || []).includes(
        req.user.id,
      ),
      canAnswerFAQ: (event.permissions.whoCanAnswerFAQ || []).includes(
        req.user.id,
      ),
      eventData: event,
    });
  } catch (error) {
    console.error("❌ checkEventStatus error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "An error occurred while fetching event status.",
    });
  }
};

//Controller 24
const getEventById = async (req, res) => {
  try {
    const { eventId, slug } = req.query;

    let query = {};

    if (eventId) {
      query._id = eventId;
    } else if (slug) {
      query.slug = slug;
    } else {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "eventId or slug is required.",
      });
    }

    // First check if event exists
    const event = await Event.findOne(query).lean();

    if (!event) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Event not found." });
    }

    // Fetch and map itineraries if they exist
    const itineraryIds = event.itineraries || [];
    if (itineraryIds.length > 0) {
      const itineraries = await fetchItineraries({ itineraryIds });
      event.itineraries = itineraries;
    }

    return res.status(StatusCodes.OK).json(event);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ error: "An error occurred while fetching the event." });
  }
};

const setEventLayout = async (req, res) => {
  try {
    const { eventId, layoutId } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(eventId) ||
      !mongoose.Types.ObjectId.isValid(layoutId)
    ) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Valid eventId and layoutId are required.",
      });
    }

    const event = await Event.findByIdAndUpdate(
      eventId,
      { layoutId },
      { new: true },
    );

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Event not found.",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      event,
    });
  } catch (error) {
    console.error("setEventLayout error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Something went wrong while linking the layout.",
    });
  }
};

//Controller 25
const editEventDetails = async (req, res) => {
  try {
    const { eventId, clubId } = req.query;
    const {
      url,
      description,
      ticketAvailable,
      ticketTypes,
      place,
      eventManagerMail,
      eventManagerPhone,
      extraFields,
      extraFieldsRequired,
    } = req.body;

    if (
      !mongoose.Types.ObjectId.isValid(eventId) ||
      !mongoose.Types.ObjectId.isValid(clubId)
    ) {
      return res.status(400).json({ message: "Invalid eventId or clubId" });
    }

    if (
      !url &&
      !description &&
      ticketAvailable === undefined &&
      !ticketTypes &&
      !place &&
      eventManagerMail === undefined &&
      eventManagerPhone === undefined &&
      extraFields === undefined &&
      extraFieldsRequired === undefined
    ) {
      return res.status(400).json({ message: "No fields to update" });
    }

    const event = await Event.findById(eventId, { permissions: 1 }).lean();
    const isAdmin = req.user?.role === "admin";

    const canEdit = Array.isArray(event?.permissions?.whoCanEditEvent)
      ? event.permissions.whoCanEditEvent.some(
        (id) => id?.toString() === req.user?.id
      )
      : false;

    if (!isAdmin && !canEdit) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ msg: "Unaccessible route." });
    }

    let normalizedTicketTypes;
    if (ticketTypes !== undefined) {
      const ticketValidation = normalizeRequiredTicketTypes(ticketTypes);
      if (ticketValidation.error) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ message: ticketValidation.error });
      }

      normalizedTicketTypes = ticketValidation.ticketTypes;
    }

    const normalizedTicketAvailable =
      ticketAvailable !== undefined || normalizedTicketTypes !== undefined
        ? true
        : undefined;

    // Update Event
    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      {
        ...(url !== undefined && { url }),
        ...(description !== undefined && { description }),
        ...(normalizedTicketAvailable !== undefined && {
          ticketAvailable: normalizedTicketAvailable,
        }),
        ...(normalizedTicketTypes !== undefined && {
          ticketTypes: normalizedTicketTypes,
        }),
        ...(place !== undefined && { place }),
        ...(eventManagerMail !== undefined && { eventManagerMail }),
        ...(eventManagerPhone !== undefined && { eventManagerPhone }),
        ...(extraFields !== undefined && { extraFields }),
        ...(extraFieldsRequired !== undefined && { extraFieldsRequired }),
      },
      { new: true },
    );

    if (!updatedEvent) {
      return res.status(404).json({ message: "Event not found" });
    }

    try {
      await sendKafkaMessage("EDIT_EVENT", "universe", {
        clubId,
        eventId,
        newData: {
          url,
          description,
          ticketAvailable: normalizedTicketAvailable,
          ticketTypes: normalizedTicketTypes,
          place,
          eventManagerMail,
          eventManagerPhone,
          extraFields,
          extraFieldsRequired,
        },
      });
    } catch (kafkaError) {
      console.error("EDIT_EVENT kafka publish failed:", kafkaError.message);
    }

    res
      .status(200)
      .json({ message: "Event updated successfully", event: updatedEvent });
  } catch (error) {
    console.error("Error updating event:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

//Controller 26
const searchEvents = async (req, res) => {
  try {
    const { q, status, date, clubName, place } = req.query;

    const query = {};

    if (q && typeof q === "string") {
      const keywords = q.split(",").map((word) => word.trim());
      const regexes = keywords.map((kw) => new RegExp(kw, "i"));
      query.$or = [
        { name: { $in: regexes } },
        { description: { $in: regexes } },
        { place: { $in: regexes } },
      ];
    }

    if (place && typeof place === "string") {
      query.place = new RegExp(place, "i");
    }

    if (status && typeof status === "string") {
      query.status = status;
    }

    if (date && typeof date === "string") {
      const parsedDate = new Date(date);
      if (!isNaN(parsedDate.getTime())) {
        const startOfDay = new Date(parsedDate.setHours(0, 0, 0, 0));
        const endOfDay = new Date(parsedDate.setHours(23, 59, 59, 999));
        query.eventDate = { $gte: startOfDay, $lte: endOfDay };
      }
    }

    if (clubName && typeof clubName === "string") {
      query["belongsTo.name"] = new RegExp(clubName, "i");
    }

    const events = await Event.find(query, {
      _id: 1,
      name: 1,
      belongsTo: 1,
      url: 1,
      eventDate: 1,
      startTime: 1,
      endTime: 1,
      place: 1,
      status: 1,
    }).sort({ eventDate: -1 });

    return res.status(StatusCodes.OK).json(events);
  } catch (error) {
    console.error("Error searching events:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

//Controller 27
const mailEventStats = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Please provide an event id.");
    }
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).send("Event not found.");
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
    const intro = "";
    const outro = "";
    const subject = "Event report";
    const destination = [
      event.authorizedPerson?.email || event.eventManagerMail,
    ];
    // const destination = ["amartyasingh1010@gmail.com"];

    // Fetch ticket details
    const query = { ticketIds };
    const tickets = await fetchDetailedTicketsByIds(query);

    const revenueRows = graphData
      .map(
        ({ label, value }) => `
      <tr>
        <td>${label}</td>
        <td>₹${value}</td>
      </tr>`,
      )
      .join("");

    const pdfUrl = await generateTicketPDFAndUpload({
      tickets: tickets,
      eventName: event.name,
      graphData,
      totalRevenue,
      totalTicketsSold: ticketsSold,
      clubName: event.belongsTo.name,
    });

    console.log("pdf url", pdfUrl);

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
      emailHTML,
    );
    await ses.sendEmail(params).promise();
    return res.status(StatusCodes.OK).send("Report successfully mailed!");
  } catch (error) {
    console.error("Error sending report:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

const addExtraFieldsToEvent = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .json({ msg: "You are not authorized to access this route." });
    }
    const { eventId } = req.query;
    const { extraFields, extraFieldsRequired } = req.body;

    if (!Array.isArray(extraFields) || extraFields.length === 0) {
      return res
        .status(400)
        .json({ message: "extraFields must be a non-empty array." });
    }

    // Validate individual field structures
    for (const field of extraFields) {
      if (!field.fieldName || !field.type) {
        return res.status(400).json({
          message: "Each extraField must contain fieldName and type.",
        });
      }
      const allowedTypes = ["String", "Number", "Boolean", "Date", "Enum", "Doc"];
      if (!allowedTypes.includes(field.type)) {
        return res.status(400).json({
          message: `Invalid type "${field.type
            }". Allowed types are: ${allowedTypes.join(", ")}`,
        });
      }
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    // Update fields
    event.extraFields = extraFields;
    event.extraFieldsRequired = !!extraFieldsRequired;

    await event.save();

    res
      .status(200)
      .json({ message: "Extra fields updated successfully", event });
  } catch (error) {
    console.error("Error updating extra fields:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

const promoteEvent = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "You are not authorized to access this route",
      });
    }

    const { id, duration, promotionLevel } = req.body;

    // Validate inputs
    if (!duration || typeof duration !== "string") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Duration is required (e.g., '6h', '2d').",
      });
    }

    if (promotionLevel == null || isNaN(promotionLevel)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: "Promotion level must be a number." });
    }

    // Find event
    const event = await Event.findById(id);
    if (!event) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Event not found." });
    }

    // Parse duration (supports hours 'h' and days 'd')
    const regex = /^(\d+)(h|d)$/i;
    const match = duration.match(regex);

    if (!match) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Invalid duration format. Use '6h' or '2d' etc.",
      });
    }

    const amount = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    let expiry = new Date();
    if (unit === "h") {
      expiry.setHours(expiry.getHours() + amount);
    } else if (unit === "d") {
      expiry.setDate(expiry.getDate() + amount);
    }

    // Update event
    event.isPromoted = true;
    event.promotionLevel = Number(promotionLevel);
    event.promotionExpiry = expiry;
    await event.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Event promoted successfully.",
      event: {
        id: event._id,
        isPromoted: event.isPromoted,
        promotionLevel: event.promotionLevel,
        promotionExpiry: event.promotionExpiry,
      },
    });
  } catch (err) {
    console.log("Error promoting event :", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong!",
    });
  }
};

const demoteEvent = async (req, res) => {
  try {
    const { id } = req.query;

    const event = await Event.findById(id);
    if (!event) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Event not found." });
    }

    // Reset promotion fields
    event.isPromoted = false;
    event.promotionLevel = 0;
    event.promotionExpiry = null;

    await event.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Event demoted successfully.",
      event: {
        id: event._id,
        isPromoted: event.isPromoted,
        promotionLevel: event.promotionLevel,
        promotionExpiry: event.promotionExpiry,
      },
    });
  } catch (error) {
    console.error("Error demoting event:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Server error while demoting event." });
  }
};

const getEventPermissions = async (req, res) => {
  try {
    const { eventId } = req.query;

    // Fetch permissions + members/admins/team info
    const event = await Event.findById(eventId).select(
      "permissions belongsTo universeMetaData",
    );
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }

    const club = await fetchNativeClubData({
      id: event.belongsTo.id,
      fields: ["adminId", "members", "team"],
      callSign: "universe",
    });

    const permissions = event.permissions || {};

    // Collect all unique user IDs across all permission keys
    const allUserIds = [
      ...(permissions.whoCanSeeStats || []),
      ...(permissions.whoCanScanTickets || []),
      ...(permissions.whoCanEditEvent || []),
      ...(permissions.whoCanAnswerFAQ || []),
    ];

    const uniqueUserIds = [...new Set(allUserIds.map((id) => id.toString()))];

    const userMap = await getUserMetaMap(uniqueUserIds, [
      "name",
      "image",
      "pushToken",
    ]);

    // Build role lookup sets
    const adminSet = new Set(club.adminId.map((id) => id.toString()));
    const memberSet = new Set(club.members.map((id) => id.toString()));
    const teamMap = club.team.reduce((acc, t) => {
      acc[t.id.toString()] = t.pos || "team"; // store position if available
      return acc;
    }, {});

    // Replace IDs in permissions with user objects + role
    const populatedPermissions = {};
    for (const [key, ids] of Object.entries(permissions)) {
      populatedPermissions[key] = (ids || []).map((id) => {
        const strId = id.toString();
        let role = "member";

        if (teamMap[strId]) {
          role = "team";
        } else if (adminSet.has(strId)) {
          role = "admin";
        } else if (memberSet.has(strId)) {
          role = "member";
        }

        return {
          _id: strId,
          role,
          ...(userMap[strId] || {}),
        };
      });
    }

    res.status(200).json({
      eventId,
      permissions: populatedPermissions,
    });
  } catch (error) {
    console.error("Error fetching event permissions:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const assignDefaultPermissions = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "You are not authorized to access this route",
      });
    }

    const events = await Event.find().select(
      "belongsTo permissions universeMetaData",
    );
    if (!events.length) {
      return res.status(404).json({ message: "No events found" });
    }

    let updatedEvents = [];

    for (const event of events) {
      const clubId = event.belongsTo?.id;
      if (!clubId) continue;

      const club = await fetchNativeClubData({
        id: clubId,
        fields: ["adminId", "members", "team", "mainAdmin"],
        callSign: event.universeMetaData.callSign,
      });
      if (!club) continue;

      const newPermissions = {
        ...event.permissions,
        whoCanSeeStats: club.mainAdmin ? [club.mainAdmin] : [],
        whoCanScanTickets: club.adminId || [],
        whoCanEditEvent: club.mainAdmin ? [club.mainAdmin] : [],
        whoCanAnswerFAQ: club.adminId || [],
      };

      await Event.updateOne(
        { _id: event._id },
        { $set: { permissions: newPermissions } },
      );

      updatedEvents.push({
        eventId: event._id,
        permissions: newPermissions,
      });
    }

    res.status(200).json({
      message: "Permissions updated successfully for all events",
      updatedEvents,
    });
  } catch (error) {
    console.error("Error assigning permissions:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

const updateEventPermission = async (req, res) => {
  try {
    const { eventId, permissionKey } = req.query;
    const { selector = [], value = [] } = req.body; // selector is array now

    // Fetch club
    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ message: "Club not found" });
    }

    const club = await fetchNativeClubData({
      id: event.belongsTo.id,
      fields: ["adminId", "members", "team", "mainAdmin"],
      callSign: "universe",
    });
    if (!club) {
      return res.status(404).json({ message: "Club not found" });
    }

    // Authorization check
    if (req.user.role !== "admin" && req.user.id !== club.mainAdmin) {
      return res
        .status(403)
        .json({ message: "Not authorized to update permissions" });
    }

    // Validate permission key
    const validKeys = [
      "whoCanSeeStats",
      "whoCanScanTickets",
      "whoCanEditEvent",
      "whoCanAnswerFAQ",
    ];
    if (!validKeys.includes(permissionKey)) {
      return res.status(400).json({ message: "Invalid permission key" });
    }

    let updated = [];

    // 🔑 Handle selectors
    if (selector.includes("Select All")) {
      updated = club.members || [];
    } else {
      for (const sel of selector) {
        const normalized = sel.trim().toLowerCase();
        if (normalized === "select admins") {
          updated.push(...(club.adminId || []));
        } else if (normalized === "select core team") {
          updated.push(...(club.team || []).map((t) => t.id));
        } else if (normalized === "select members") {
          updated.push(...(club.members || []));
        }
      }

      // Fallback to explicit value
      if (updated.length === 0 && value.length > 0) {
        updated = value;
      }
    }

    // Deduplicate & save
    const uniqueIds = [...new Set(updated.map(String))];
    event.permissions[permissionKey] = uniqueIds;
    await event.save();

    const userMap = await getUserMetaMap(uniqueIds, [
      "name",
      "image",
      "pushToken",
    ]);

    // Helper to determine role inside the club
    const getRole = (id) => {
      if ((club.team || []).map((t) => String(t.id)).includes(id))
        return "team";
      if ((club.adminId || []).map(String).includes(id)) return "admin";
      if ((club.members || []).map(String).includes(id)) return "member";
      return "member"; // fallback
    };

    const populated = uniqueIds.map((id) => ({
      _id: id,
      ...(userMap[id] || {}),
      role: getRole(id), //  Add role based on club data
    }));

    res.status(200).json({
      message: `Permission '${permissionKey}' updated successfully`,
      updatedPermission: populated, // contains name, image, pushToken, role
      permissions: event.permissions, // still raw IDs
    });
  } catch (error) {
    console.error("Error updating event permission:", error);
    res.status(500).json({ message: "Server error", error: error.message });
  }
};

//Controller 28
const getPastOrFutureEvents = async (req, res) => {
  try {
    const { mode, size = 6 } = req.query;
    const limitSize = Math.max(parseInt(size), 1); // ensure it's a number >= 1

    if (mode === "future") {
      const events = Event.aggregate([
        {
          $match: {
            $or: [
              { status: "featured" }, // always include featured
              { eventDate: { $gte: new Date() } }, // include future events
            ],
          },
        },
        {
          $addFields: {
            isFeatured: { $cond: [{ $eq: ["$status", "featured"] }, 1, 0] },
          },
        },
        {
          $sort: {
            isFeatured: -1, // featured first
            eventDate: 1, // then earliest date
          },
        },
        { $limit: limitSize },
        { $project: { bookedBy: 0, isFeatured: 0 } }, // hide helper field
      ]);

      return res.status(StatusCodes.OK).json(events);
    }

    const matchStage =
      mode === "future"
        ? { eventDate: { $gte: new Date() } }
        : { eventDate: { $lt: new Date() } };

    const sortStage = {
      eventDate: mode === "future" ? 1 : -1,
    };

    const events = await Event.aggregate([
      { $match: matchStage },
      { $sort: sortStage },
      { $limit: limitSize },
      { $project: { bookedBy: 0 } },
    ]);

    return res.status(StatusCodes.OK).json(events);
  } catch (error) {
    console.error("Error finding events:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

const getEventFieldsById = async (req, res) => {
  try {
    const { id, ids, fields } = req.body;

    if (!id && (!ids || !Array.isArray(ids) || ids.length === 0)) {
      return res
        .status(400)
        .json({ error: "Event ID or array of Event IDs is required." });
    }

    const isArrayProjection = Array.isArray(fields) && fields.length > 0;

    const isObjectProjection =
      fields &&
      typeof fields === "object" &&
      !Array.isArray(fields) &&
      Object.keys(fields).length > 0;

    if (!isArrayProjection && !isObjectProjection) {
      return res.status(400).json({
        error: "fields must be a non-empty array or projection object",
      });
    }

    // Convert array of fields to space-separated string for Mongoose projection
    const projection = isArrayProjection ? fields.join(" ") : fields;

    if (Array.isArray(ids) && ids.length > 0) {
      const events = await Event.find({ _id: { $in: ids } }).select(projection);

      if (!events || events.length === 0) {
        return res.status(404).json({ error: "Events not found." });
      }

      return res.status(200).json({ data: events });
    }

    const event = await Event.findById(id).select(projection);

    if (!event) {
      return res.status(404).json({ error: "Event not found." });
    }

    return res.status(200).json({ data: event });
  } catch (err) {
    console.error("Error fetching event fields:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

const checkEventAuthorization = async (req, res) => {
  try {
    const { eventId, userId } = req.query;

    if (!eventId || !userId) {
      return res.status(400).json({ message: "Missing eventId or userId." });
    }

    const event = await Event.findById(eventId, { authorizedPerson: 1 });

    if (!event) {
      return res.status(404).json({ message: "Event not found." });
    }

    if (
      !event.authorizedPerson ||
      event.authorizedPerson._id.toString() !== userId
    ) {
      return res.status(200).json({ authorized: false });
    }

    return res.status(200).json({ authorized: true });
  } catch (error) {
    console.error("❌ Authorization check failed:", error);
    return res.status(500).json({ message: "Internal server error." });
  }
};

const getPastEvents = async (req, res) => {
  try {
    const {
      monthsAgo = 3,
      daysAgo,
      startDate,
      projection,
      limit = 8,
    } = req.body;

    let fromDate = new Date();

    // Priority-based date resolution
    if (startDate) {
      fromDate = new Date(startDate);
    } else if (daysAgo) {
      fromDate.setDate(fromDate.getDate() - Number(daysAgo));
    } else {
      fromDate.setMonth(fromDate.getMonth() - Number(monthsAgo));
    }

    const validStatuses = ["past and unclear", "past and clear", "expired"];

    const events = await Event.aggregate([
      {
        $match: {
          status: { $in: validStatuses },
          eventDate: { $gte: fromDate },
        },
      },
      {
        $addFields: {
          bookingsCount: { $size: "$bookedBy" },
        },
      },
      {
        $sort: {
          bookingsCount: -1,
          eventDate: -1,
        },
      },
      {
        $limit: Number(limit),
      },
      {
        $project: projection || {},
      },
    ]);

    return res.status(200).json({ data: events });
  } catch (error) {
    console.error("Error fetching past events:", error);
    return res.status(500).json({
      error: "Server error while fetching past events",
    });
  }
};

const getEventGallery = async (req, res) => {
  try {
    const { eventIds } = req.body;

    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return res.status(400).json({
        error: "eventIds array is required",
      });
    }

    const objectIds = eventIds
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (objectIds.length === 0) {
      return res.status(400).json({
        error: "No valid event IDs provided",
      });
    }

    const events = await Event.aggregate([
      {
        $match: {
          _id: { $in: objectIds },
        },
      },
      {
        $project: {
          name: 1,
          eventDate: 1,
          place: 1,
          belongsTo: 1,
          gallery: {
            $filter: {
              input: "$gallery",
              as: "g",
              cond: { $eq: ["$$g.featured", true] },
            },
          },
        },
      },
    ]);

    return res.status(200).json({
      data: events,
    });
  } catch (error) {
    console.error("Error fetching event gallery:", error);
    return res.status(500).json({
      error: "Server error while fetching event gallery",
    });
  }
};

const addToGallery = async (req, res) => {
  try {
    const { eventId } = req.query;
    const userId = req.user.id;
    const { media } = req.body;

    // Check if user has bought a ticket for this event
    const hasTicket = await fetchTicketFieldsByQuery({
      searchBy: { eventId: new mongoose.Types.ObjectId(eventId), boughtBy: userId },
      fields: ["boughtBy"],
      single: true,
    });

    // if (!hasTicket) {
    //   return res.status(403).json({
    //     success: false,
    //     message: "You must buy a ticket to upload media to this event.",
    //   });
    // }

    // Validate media array
    if (!Array.isArray(media) || media.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No media provided.",
      });
    }

    const user_query = {
      id: userId,
      fields: ["name", "image"],
    };
    const userData = await fetchUserData(user_query);

    // Add postedBy field to each media item
    const formattedMedia = media.map((item) => ({
      ...item,
      postedBy: userId,
      userMetaData: {
        name: userData.name,
        image: userData.image,
      },
      downloadedBy: [], // default empty array
    }));

    // Push media to event gallery
    const updatedEvent = await Event.findByIdAndUpdate(
      eventId,
      { $push: { gallery: { $each: formattedMedia } } },
      { new: true },
    );

    if (updatedEvent) {
      // Create a memory
      let tags = formattedMedia.flatMap((media) =>
        (media.tags ?? []).map((tag) => ({ ...tag.user, type: "people" })),
      );
      tags = tags.filter((t) => t._id !== userId);
      const memoryData = {
        createdBy: userId,
        type: "media",
        template: "Events",
        title: updatedEvent.name,
        tags,
        assets: formattedMedia,
        date: new Date(),
        visibility: "inThisMemory",
        creatorMetaData: {
          name: userData.name,
          image: userData.image,
        },
        callSign: "universe",
      };
      await sendKafkaMessage("CREATE_MEMORY", "memory", { memoryData });
    }

    if (!updatedEvent) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    // Respond with updated gallery
    return res.status(200).json({
      success: true,
      message: "Media added to gallery successfully.",
      gallery: updatedEvent.gallery,
    });
  } catch (err) {
    console.error("Error adding media to gallery:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while adding media to gallery.",
    });
  }
};

const getEventGalleryPaginated = async (req, res) => {
  try {
    const { eventId } = req.query;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const mediaType = req.query.mediaType;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required",
      });
    }

    // Fetch event with gallery + bookedBy
    const event = await Event.findById(eventId).select("gallery bookedBy");

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    let gallery = event.gallery || [];

    // Filter by image/video if specified
    if (mediaType && ["image", "video"].includes(mediaType)) {
      gallery = gallery.filter((g) => g.type === mediaType);
    }

    const totalCount = gallery.length;
    const totalPages = Math.ceil(totalCount / limit);
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;

    const paginatedGallery = gallery.slice(startIndex, endIndex);

    // ✅ Count unique contributors (only for first page)
    let contributorCount = undefined;
    let attendedCount = undefined;
    if (page === 1) {
      const uniqueContributors = new Set();

      gallery.forEach((item) => {
        // Add the uploader
        if (item.postedBy) {
          uniqueContributors.add(String(item.postedBy));
        }

        // Add all tagged users
        if (Array.isArray(item.tags)) {
          item.tags.forEach((tag) => {
            if (tag.user && tag.user._id) {
              uniqueContributors.add(String(tag.user._id));
            }
          });
        }
      });

      contributorCount = uniqueContributors.size;
      attendedCount = event.bookedBy.length;
    }

    res.status(200).json({
      success: true,
      page,
      limit,
      totalCount,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      attended: attendedCount,
      contributors: contributorCount, // may be undefined for page > 1
      data: paginatedGallery,
    });
  } catch (error) {
    console.error("Error fetching event gallery:", error.message);
    res.status(500).json({
      success: false,
      message: "Something went wrong while fetching gallery.",
    });
  }
};

const getEventGalleryContributors = async (req, res) => {
  try {
    const { eventId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(eventId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid event ID",
      });
    }

    // Step 1: Aggregate all contributor IDs (postedBy + tags.user._id)
    const event = await Event.findById(eventId, { gallery: 1 }).lean();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Use a map to count occurrences
    const contributorCountMap = new Map();

    event.gallery?.forEach((media) => {
      // Count uploader
      if (media.postedBy) {
        const id = media.postedBy.toString();
        contributorCountMap.set(id, (contributorCountMap.get(id) || 0) + 1);
      }

      // Count tagged users
      media.tags?.forEach((tag) => {
        if (tag.user && tag.user._id) {
          const id = tag.user._id.toString();
          contributorCountMap.set(id, (contributorCountMap.get(id) || 0) + 1);
        }
      });
    });

    if (contributorCountMap.size === 0) {
      return res.status(200).json({
        success: true,
        contributors: [],
        message: "No contributors found",
      });
    }

    const contributorIds = Array.from(contributorCountMap.keys());

    // Step 2: Fetch user profiles
    const userPromises = contributorIds.map((id) =>
      fetchUserData({ id, fields: ["name", "image"] }),
    );
    const users = await Promise.all(userPromises);

    // Step 3: Merge with counts
    const contributors = users.map((user) => ({
      _id: user._id,
      name: user.name,
      image: user.image,
      occurrences: contributorCountMap.get(user._id.toString()) || 0,
    }));

    return res.status(200).json({
      success: true,
      count: contributors.length,
      contributors,
    });
  } catch (error) {
    console.error("Error fetching event gallery contributors:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

function formatDateReadable(date) {
  if (!date) return "";

  const d = new Date(date);

  const day = d.getDate();
  const month = d.toLocaleString("en-US", { month: "long" });

  // Determine suffix
  const suffix =
    day % 10 === 1 && day !== 11
      ? "st"
      : day % 10 === 2 && day !== 12
        ? "nd"
        : day % 10 === 3 && day !== 13
          ? "rd"
          : "th";

  return `${day}${suffix} of ${month}`;
}

// secondary actions after auto event memory insertion
const sendEventMemoryEmail = async (insertedMemories, userMap, eventData) => {
  try {
    for (const mem of insertedMemories) {
      const user = userMap.get(mem.createdBy.toString());
      if (!user?.email) continue;

      sendMail(
        user.name,
        "A new event memory was added to your Memory Lane.",
        `${eventData.name} held on ${formatDateReadable(
          new Date(eventData.eventDate),
        )}.`,
        "A new memory added!",
        user.email,
        {},
        autoGenEventMemoryHTML({
          memoryId: mem._id,
          userId: user._id,
          eventDate: formatDateReadable(new Date(eventData.eventDate)),
          eventName: eventData.name,
          userName: user.name,
        }),
      )
        .then(({ ses, params }) => {
          ses.sendEmail(params, (err) => {
            if (err) console.log("SES send error:", err);
          });
        })
        .catch((err) => console.log("Mail send failed:", err));
    }
  } catch (error) {
    console.log(error);
  }
};

const changeGalleryFeatured = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .json({ msg: "You are not authorized to access this route." });
    }

    const { eventId, galleryId } = req.query;
    const { featured = false } = req.body;

    if (!eventId || !galleryId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "eventId and galleryId are required",
      });
    }

    // Find the specific event and gallery item
    const event = await Event.findOne(
      { _id: eventId, "gallery._id": galleryId },
      { "gallery.$": 1 },
    );

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Event or gallery item not found",
      });
    }

    // Change the value
    const updatedEvent = await Event.findOneAndUpdate(
      { _id: eventId, "gallery._id": galleryId },
      { $set: { "gallery.$.featured": featured } },
      { new: true },
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      message: `Gallery item featured set to ${featured}`,
      featured,
    });
  } catch (error) {
    console.error("Error changing gallery featured:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to change gallery featured",
    });
  }
};

const addTagsToEvent = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .json({ msg: "You are not authorized to access this route." });
    }

    const { tags, eventId } = req.body;

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ msg: "Tags must be a non-empty array" });
    }

    const event = await Event.findByIdAndUpdate(
      eventId,
      {
        $push: {
          tags: {
            $each: tags,
          },
        },
      },
      { new: true, runValidators: true },
    );

    return res
      .status(StatusCodes.OK)
      .json({ msg: "Done!", eventTitle: event.name, tags: event.tags });
  } catch (error) {
    console.error("Error adding tags:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to add tags",
    });
  }
};

const getCurrentWeekEvents = async (req, res) => {
  try {
    const nextSevenDays = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const events = await Event.aggregate([
      {
        $match: {
          status: "featured",
          eventDate: { $gte: new Date(), $lte: nextSevenDays },
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          belongsTo: 1,
          url: 1,
          eventDate: 1,
          startTime: 1,
          endTime: 1,
          place: 1,
        },
      },
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Fetched events of the week successfully",
      events,
    });
  } catch (error) {
    console.error("Error fetching week events:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Something went wrong" });
  }
};

const getPromotedEvents = async (req, res) => {
  try {
    const events = await Event.aggregate([
      {
        $match: {
          status: "featured",
          isPromoted: true,
        },
      },
      {
        $sort: {
          promotionLevel: -1,
          rating: -1,
        },
      },
      {
        $addFields: {
          startsFrom: {
            $min: {
              $map: {
                input: "$ticketTypes",
                as: "t",
                in: { $toDouble: "$$t.price" },
              },
            },
          },
        },
      },

      {
        $project: {
          name: 1,
          url: 1,
          place: 1,
          eventDate: 1,
          startTime: 1,
          endTime: 1,
          belongsTo: 1,
          startsFrom: 1,
        },
      },
    ]);
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Fetched Promoted events successfully",
      events,
    });
  } catch (error) {
    console.error("Error in fetching promoted events: ", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong" });
  }
};

const getTopPastEvents = async (req, res) => {
  try {
    const events = await Event.aggregate([
      {
        $match: {
          eventDate: { $lt: new Date() },
        },
      },

      {
        $addFields: {
          bookings: { $size: "$bookedBy" },
        },
      },

      {
        $sort: {
          bookings: -1,
        },
      },
      {
        $limit: 7,
      },
      {
        $project: {
          name: 1,
          url: 1,
          place: 1,
          eventDate: 1,
          startTime: 1,
          endTime: 1,
          belongsTo: 1,
        },
      },
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Fetched top events successfully",
      events,
    });
  } catch (error) {
    console.error("Error in fetching top events: ", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      msg: "Something went wrong",
    });
  }
};

const addExtraFieldsToTicketType = async (req, res) => {
  try {
    const { eventId } = req.query;
    const { type, extraFieldsRequired, extraFields } = req.body;

    if (!type) {
      return res.status(400).json({
        success: false,
        message: "Ticket type is required.",
      });
    }

    // 1️⃣ Check if event exists
    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    // 2️⃣ Check if the ticket type exists inside ticketTypes[]
    const idx = event.ticketTypes.findIndex((t) => t.type === type);

    if (idx === -1) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Ticket type not found inside ticketTypes.",
      });
    }

    if (!Array.isArray(extraFields) || extraFields.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "extraFields must be a non-empty array." });
    }

    // Validate individual field structures
    for (const field of extraFields) {
      if (!field.fieldName || !field.type) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          message: "Each extraField must contain fieldName and type.",
        });
      }
      const allowedTypes = ["String", "Number", "Boolean", "Date", "Enum", "Doc"];
      if (!allowedTypes.includes(field.type)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          message: `Invalid type "${field.type
            }". Allowed types are: ${allowedTypes.join(", ")}`,
        });
      }
    }

    // 3️⃣ Update the values directly in the object
    event.ticketTypes[idx].extraFieldsRequired = extraFieldsRequired;
    event.ticketTypes[idx].extraFields = extraFields;

    await event.save();

    return res.status(200).json({
      success: true,
      message: "Ticket type updated successfully.",
      data: event.ticketTypes[idx],
    });
  } catch (error) {
    console.log("Error updating ticket type:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error.",
      error: error.message,
    });
  }
};

const getLatestEvents = async (req, res) => {
  try {
    const batch = parseInt(req.query.batch) || 1; // page number
    const limit = parseInt(req.query.limit) || 10; // items per batch
    const skip = (batch - 1) * limit;

    const events = await Event.find(
      {},
      {
        bookedBy: 0,
        faq: 0,
        ticketSellingDays: 0,
        cumulativeRevenue: 0,
        courseAnalytics: 0,
        permissions: 0,
        gallery: 0,
        postProduction: 0,
      },
    )
      .sort({ eventDate: -1 }) // newest first
      .skip(skip)
      .limit(limit);

    const total = await Event.countDocuments();

    return res.json({
      success: true,
      batch,
      limit,
      total,
      totalBatches: Math.ceil(total / limit),
      events,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ success: false, message: "Server Error" });
  }
};

const toggleWaitlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { eventId } = req.body;

    if (!eventId) return res.status(400).json({ message: "Event ID required" });

    const event = await Event.findById(eventId);

    if (!event) return res.status(404).json({ message: "Event not found" });

    const isWishlisted = event.waitlist?.includes(userId);

    if (isWishlisted) {
      // remove user from waitlist
      event.waitlist.pull(userId);
      await event.save();

      return res.status(200).json({
        success: true,
        message: "Removed from waitlist",
        wishlisted: false,
        count: event.waitlist.length,
      });
    } else {
      // add user to waitlist
      event.waitlist.push(userId);
      await event.save();

      return res.status(200).json({
        success: true,
        message: "Added to waitlist",
        wishlisted: true,
        count: event.waitlist.length,
      });
    }
  } catch (err) {
    console.log(err);
    return res
      .status(500)
      .json({ message: "Something went wrong", error: err.message });
  }
};

const getSearchedEvents = async (req, res) => {
  try {
    const { query, limit = 12, page = 1 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const events = await Event.aggregate([
      {
        $search: {
          index: "default",
          compound: {
            should: [
              {
                autocomplete: {
                  query,
                  path: "name",
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 5 } },
                },
              },

              {
                text: {
                  query,
                  path: ["description", "tags"],
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 2 } },
                },
              },

              {
                text: {
                  query,
                  path: "primaryCategory",
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 4 } },
                },
              },

              {
                text: {
                  query,
                  path: "secondaryCategories",
                  fuzzy: { maxEdits: 1 },
                  score: { boost: { value: 3 } },
                },
              },
            ],
          },
        },
      },
      { $addFields: { membersCount: { $size: "$bookedBy" } } },
      {
        $project: {
          name: 1,
          slug: 1,
          url: 1,
          description: 1,
          place: 1,
          eventDate: 1,
          belongsTo: 1,
          ticketAvailable: 1,
          ticketTypes: 1,
          status: 1,
          type: { $literal: "event" },
          score: { $meta: "searchScore" },
          primaryCategory: 1,
          secondaryCategories: 1,
        },
      },
      {
        $addFields: {
          isFeatured: {
            $cond: [{ $eq: ["$status", "featured"] }, 1, 0],
          },
        },
      },
      { $sort: { isFeatured: -1, score: -1, membersCount: -1, eventDate: -1, _id: 1 } },
      { $skip: skip },
      { $limit: Number(limit) },
    ]);

    return res.status(StatusCodes.OK).json({ success: true, data: events });
  } catch (err) {
    console.log("Error fetching searched events:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, msg: "Something went wrong!" });
  }
};

const insertNewFields = async (req, res) => {
  try {
    const allevents = await Event.find({});

    const bulkOps = allevents.map((event) => ({
      updateOne: {
        filter: { _id: event._id },
        update: {
          $set: {
            uid: "696f491a0bfc89b35dc62326",
            universeMetaData: {
              location: "Punjab, India",
              logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
              logoKey: "public/universes/lpu_logo-removebg-preview.png",
              name: "Lovely Professional University",
              callSign: "LPU",
              lat: 31.25361,
              lng: 75.70361,
            },
          },
        },
      },
    }));

    const result = await Event.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} events`);

    res.status(200).json({
      message: "Events updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getFeaturedEvents = async (req, res) => {
  try {
    const { fields } = req.body;

    const isArrayProjection = Array.isArray(fields) && fields.length > 0;

    const isObjectProjection =
      fields &&
      typeof fields === "object" &&
      !Array.isArray(fields) &&
      Object.keys(fields).length > 0;

    if (!isArrayProjection && !isObjectProjection) {
      return res.status(400).json({
        error: "fields must be a non-empty array or projection object",
      });
    }

    // Convert array of fields to space-separated string for Mongoose projection
    const projection = isArrayProjection ? fields.join(" ") : fields;

    const events = await Event.find({ status: "featured" })
      .select(projection)
      .lean();

    if (!events) {
      return res.status(404).json({ error: "Event not found." });
    }

    return res.status(200).json({ data: events });
  } catch (err) {
    console.error("Error fetching featured events:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

const getFeaturedEventsForFeed = async (req, res) => {
  try {
    const userId = req.user.id;
    const { uid, universeId } = req.query;
    const limit = 4;
    const resolvedUniverseId = universeId || uid || "multiverse";
    const universeFilter =
      resolvedUniverseId !== "multiverse" ? { uid: resolvedUniverseId } : {};

    const user = await fetchNativeUserData({
      id: userId,
      fields: ["interests"],
      callSign: "universe",
    });

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found." });
    }

    const interestTags = user.interests || [];
    const now = new Date();

    // Query for featured events, future, matching interests
    const suggestedEvents =
      interestTags.length > 0
        ? await Event.aggregate([
          {
            $match: {
              status: "featured",
              eventDate: { $gte: now },
              tags: { $in: interestTags },
              ...universeFilter,
            },
          },
          { $limit: limit },
          {
            $project: {
              bookedBy: 0,
              amtPaid: 0,
              amtPaidTo: 0,
              ticketSellingDays: 0,
              cumulativeRevenue: 0,
              courseAnalytics: 0,
              faq: 0,
            },
          },
        ])
        : [];

    let finalEvents = [...suggestedEvents];

    // Fallback
    if (finalEvents.length < limit) {
      const needed = limit - finalEvents.length;
      const currentIds = finalEvents.map((e) => e._id);

      const fallbackEvents = await Event.aggregate([
        {
          $match: {
            status: "featured",
            eventDate: { $gte: now },
            _id: { $nin: currentIds },
            ...universeFilter,
          },
        },
        { $sample: { size: needed } },
        {
          $project: {
            bookedBy: 0,
            amtPaid: 0,
            amtPaidTo: 0,
            ticketSellingDays: 0,
            cumulativeRevenue: 0,
            courseAnalytics: 0,
            faq: 0,
          },
        },
      ]);

      finalEvents = [...finalEvents, ...fallbackEvents];
    }

    console.log("final events", finalEvents.length);
    if (finalEvents.length === 0) {
      return res.status(StatusCodes.OK).json({ events: [] });
    }

    // Sequence them using existing helper
    const sequencedEvents = await fetchRightSequence(finalEvents);

    return res.status(StatusCodes.OK).json({ events: sequencedEvents });
  } catch (error) {
    console.error("Error in getFeaturedEventsForFeed:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong");
  }
};

const slugifyAllEvents = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        message: "You are not authorized to perform this action.",
      });
    }
    const events = await Event.find({}, { _id: 1, name: 1, slug: 1 });

    let updatedCount = 0;

    for (const event of events) {
      if (!event.slug && event.name) {
        let baseSlug = slugify(event.name, {
          lower: true,
          strict: true,
        });

        let slug = baseSlug;
        let counter = 1;

        // Ensure uniqueness
        while (await Event.findOne({ slug })) {
          slug = `${baseSlug}-${counter}`;
          counter++;
        }

        await Event.updateOne({ _id: event._id }, { $set: { slug } });

        updatedCount++;
      }
    }

    return res.status(200).json({
      success: true,
      message: "Slug generation completed",
      updated: updatedCount,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const requestCancellation = async (req, res) => {
  const { id, reason, agreeToTerms } = req.body;
  try {
    if (!id || !reason) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Event ID and reason are required.");
    }

    if (reason.length < 20) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Reason must be at least 20 characters long.");
    }

    if (!agreeToTerms) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("You must agree to the terms and conditions.");
    }

    const event = await Event.findById(id);

    if (!event) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Event not found with provided ID.");
    }

    event.cancellation.requested = true;
    event.cancellation.requestedBy = req.user.id;
    event.cancellation.reason = reason;

    await event.save();
    //secondary actions
    try {
      const admins = await fetchEventAdminsByFields({
        fields: ["name", "email", "pushToken"],
      });
      const subject = `Event Cancellation Request for ${event.name}`;

      const intro = `A cancellation request has been submitted for the event ${event.name}.

      The organizer has requested that this event be cancelled. Please review the request and take the necessary action. Until an administrator approves the cancellation, the event will remain active and participants will not be notified.

      Once approved, attendees will receive a cancellation email and any eligible refunds can begin their slow parade back through the banking labyrinth.`;

      const outro = `Please review and approve or reject this request at your earliest convenience.`;

      const action = {
        instructions:
          "Click the button below to review the cancellation request:",
        button: {
          color: "#1ea1ed",
          text: "Review Request",
          url: `https://admin.macbease.com/events/requests/${event._id}`,
        },
      };

      for (const admin of admins) {
        const { name, email, pushToken } = admin;
        const destination = email;
        const { ses, params } = await sendMail(
          name,
          intro,
          outro,
          subject,
          destination,
          action,
          null,
        );

        await ses.sendEmail(params).promise();
      }
    } catch (err) {
      console.log("Error in secondary actions:", err);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Event cancellation requested successfully.",
    });
  } catch (error) {
    console.error("Error in requestEventCancellation:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const processRefund = async (razorpay_payment_id, amtPaid, userId, eventId) => {
  try {
    if (!razorpay_payment_id?.startsWith("pay_")) {
      return;
    }

    const authHeader = `Basic ${Buffer.from(
      `${process.env.RAZOR_PAY_KEY}:${process.env.RAZOR_PAY_SECRET}`,
    ).toString("base64")}`;

    // Step 1: Fetch payment from Razorpay
    const paymentResponse = await axios.get(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}`,
      { headers: { Authorization: authHeader } },
    );

    const payment = paymentResponse.data;

    if (payment.status !== "captured") {
      return;
    }

    // Step 2: Refund using Razorpay amount (NOT amtPaid)
    const refundResponse = await axios.post(
      `https://api.razorpay.com/v1/payments/${razorpay_payment_id}/refund`,
      {
        amount: payment.amount,
      },
      { headers: { Authorization: authHeader } },
    );

    // Step 3: Log refund
    await sendKafkaMessage("CREATE_REFUND", "refund", {
      paymentId: razorpay_payment_id,
      eventId,
      userId,
      amtPaid: payment.amount / 100,
      refundStatus: "PENDING",
    });
  } catch (error) {
    console.error("Razorpay error:", error.response?.data || error.message);
  }
};

const cancelEvent = async (req, res) => {
  const { eventId } = req.body;

  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const event = await Event.findById(id);

    if (!event) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Event not found with provided ID.");
    }

    event.status = "cancelled";
    await event.save();

    const tickets = await fetchMultipleTicketFieldsById({
      ticketIds: event.bookedBy,
      fields: ["boughtBy", "paymentId", "amtPaid"],
    });
    const usersData = [];
    const uniqueUsers = [...new Set(tickets.map((ticket) => ticket.boughtBy))];

    for (const userId of uniqueUsers) {
      const user = await fetchUserData({
        id: userId,
        fields: ["name", "email", "pushToken"],
      });
      usersData.push(user);
    }

    // Initate Refund for the ticket buyers
    for (const ticket of tickets) {
      if (ticket.amtPaid > 0) {
        await processRefund(
          ticket.paymentId,
          ticket.amtPaid,
          ticket.boughtBy,
          event._id,
        );
      }
    }

    try {
      const intro = `We're sorry to let you know that ${event.name} has been cancelled.

      We know you were looking forward to it, and we sincerely apologize for the change in plans.

      If you have already made a payment, your refund has been initiated and will usually be credited back to your original payment method within 5-7 working days. In some cases, depending on your bank or payment provider, it may take a little longer.

      You will receive a separate confirmation email once the refund has been successfully processed.`;

      const outro = "Thank you for your understanding and patience.";

      const subject = "Event Cancelled & Refund Information";

      const action = {
        instructions:
          "Click the button below to view your tickets and refund status:",
        button: {
          color: "#1ea1ed",
          text: "View Details",
          url: `https://app.macbease.com/tickets`,
        },
      };

      for (const user of usersData) {
        const { name, email, pushToken } = user;
        const destination = email;
        const { ses, params } = await sendMail(
          name,
          intro,
          outro,
          subject,
          destination,
          action,
          null,
        );

        await ses.sendEmail(params).promise();
      }
    } catch (err) {
      console.error("Error sending emails:", err);
    }
    return res
      .status(StatusCodes.OK)
      .json({ success: true, message: "Event cancelled successfully." });
  } catch (error) {
    console.error("Error cancelling event:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Something went wrong" });
  }
};

const requestEventLive = async (req, res) => {
  try {
    const { eventId } = req.query;

    if (!eventId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: "Event ID is required." });
    }

    const event = await Event.findById(eventId);

    if (!event) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ success: false, message: "Event not found with provided ID." });
    }

    if (event.status === "featured") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: "Event is already live." });
    }

    // send mail to admins
    try {
      const admins = await fetchEventAdminsByFields({
        fields: ["name", "email", "pushToken"],
      });
      const subject = `Make ${event.name} Live`;

      const intro = `A request has been submitted to make the event ${event.name} live on the platform.

      Please review the event details and verify that all required information, content, ticket settings, and policies are in place before approving it. Until approval is granted, the event will remain hidden from students and will not be available for registration.

      Once approved, the event will spring onto the platform stage like a curtain finally rising 🎭.`;

      const outro = `Please review this request and approve or reject it at your earliest convenience.`;

      const action = {
        instructions:
          "Click the button below to review the event and take action:",
        button: {
          color: "#16a34a",
          text: "Review Event",
          url: `https://app.macbease.com/admin/events/requests/${event._id}`,
        },
      };

      for (const admin of admins) {
        const { name, email, pushToken } = admin;
        const destination = email;
        const { ses, params } = await sendMail(
          name,
          intro,
          outro,
          subject,
          destination,
          action,
          null,
        );

        await ses.sendEmail(params).promise();
      }
    } catch (err) {
      console.error("Error sending emails:", err);
    }
    return res
      .status(StatusCodes.OK)
      .json({ success: true, message: "Event is now live." });
  } catch (err) {
    console.error("Error requesting event to be live:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong");
  }
};

const requestPostponement = async (req, res) => {
  try {
    const { eventId, eventData, eventEndDate, startTime, endTime, reason } =
      req.body;

    if (!eventId) {
      return res.status(400).json({
        success: false,
        message: "Event ID is required.",
      });
    }

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found.",
      });
    }

    if (event.postponement?.requested) {
      return res.status(400).json({
        success: false,
        message: "Postponement already requested.",
      });
    }

    if (event.status !== "featured") {
      return res.status(400).json({
        success: false,
        message: "Only featured events can be postponed.",
      });
    }

    const now = new Date();
    const prevEventDate = new Date(event.eventDate);
    const prevEventEndDate = new Date(event.eventEndDate);

    const newStartTime = new Date(startTime);
    const newEndTime = new Date(endTime);

    if (prevEventDate <= now) {
      return res.status(400).json({
        success: false,
        message: "Event already started. Cannot postpone.",
      });
    }

    if (prevEventEndDate <= now) {
      return res.status(400).json({
        success: false,
        message: "Event already ended.",
      });
    }

    if (newStartTime <= now) {
      return res.status(400).json({
        success: false,
        message: "New start time must be in future.",
      });
    }

    if (newEndTime <= newStartTime) {
      return res.status(400).json({
        success: false,
        message: "End time must be after start time.",
      });
    }

    await Event.findByIdAndUpdate(eventId, {
      $set: {
        "postponement.requested": true,
        "postponement.requestedBy": req.user.id,
        "postponement.reason": reason,
        "postponement.eventData": eventData,
        "postponement.eventEndDate": eventEndDate,
        "postponement.startTime": startTime,
        "postponement.endTime": endTime,
      },
    });

    try {
      const admins = await fetchEventAdminsByFields({
        fields: ["name", "email", "pushToken"],
      });

      const subject = `Request to Postpone ${event.name}`;

      const intro = `A request has been submitted to postpone the event ${event.name}. Please review it.`;
      const outro = `Please approve or reject this request.`;

      const action = {
        instructions: "Click below:",
        button: {
          color: "#16a34a",
          text: "Review Event",
          url: `https://app.macbease.com/admin/events/requests/${event._id}`,
        },
      };

      for (const admin of admins) {
        const { name, email } = admin;

        const { ses, params } = await sendMail(
          name,
          intro,
          outro,
          subject,
          email,
          action,
          null,
        );

        await ses.sendEmail(params).promise();
      }
    } catch (err) {
      console.error("Email error:", err.message);
    }

    return res.status(200).json({
      success: true,
      message: "Postponement request submitted successfully.",
    });
  } catch (err) {
    console.error("Controller error:", err);
    return res.status(500).json({
      success: false,
      message: "Something went wrong",
    });
  }
};

const getLiveEvents = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        msg: "Unauthorized",
      });
    }
    const count = await Event.countDocuments({
      status: "featured",
    });
    return res.status(StatusCodes.OK).json({ count });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Something went wrong",
    });
  }
};

const getTopEvents = async (req, res) => {
  try {
    const events = await Event.aggregate([
      { $match: { eventDate: { $gte: new Date() } } },
      {
        $addFields: {
          isFeatured: { $cond: [{ $eq: ["$status", "featured"] }, 1, 0] },
        },
      },
      {
        $sort: {
          isFeatured: -1, // featured first
          eventDate: 1, // then earliest date
        },
      },
      { $limit: 13 },
      {
        $project: {
          _id: 1,
          name: 1,
          url: 1,
          description: 1,
          place: 1,
          startTime: 1,
          endTime: 1,
          eventDate: 1,
          eventEndDate: 1,
          status: 1,
          belongsTo: 1,
          isPromoted: 1,
          promotionLevel: 1,
        },
      },
    ]);

    const sequencedEvents = await fetchRightSequence(events);
    return res.status(StatusCodes.OK).json(sequencedEvents);
  } catch (err) {
    console.log("Error fetching top events:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

const getCategories = async (req, res) => {
  try {
    const { limit = 5 } = req.query;

    let categories = await Event.aggregate([
      {
        $match: {
          primaryCategory: { $ne: null },
        },
      },
      {
        $group: {
          _id: "$primaryCategory",
          featuredCount: {
            $sum: {
              $cond: [{ $eq: ["$status", "featured"] }, 1, 0],
            },
          },
          totalCount: { $sum: 1 },
        },
      },
      {
        $sort: {
          featuredCount: -1, // priority 1
          totalCount: -1, // fallback
        },
      },
      {
        $limit: Number(limit),
      },
    ]);

    if (categories.length === 0) {
      categories = EVENT_CATEGORIES.slice(0, limit);
    } else {
      categories = categories.map((category) => category._id);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      categories,
      count: categories.length,
    });
  } catch (err) {
    console.log("Error fetching categories:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

const EVENT_CATEGORIES = [
  "Music",
  "Dance",
  "Drama",
  "Comedy",
  "Literary",
  "Art",
  "Photography",
  "Film",
  "Fashion",
  "Gaming",
  "Tech",
  "Workshop",
  "Seminar",
  "Sports",
  "Fitness",
  "Food",
  "Networking",
  "Startup",
  "Cultural",
  "Fest",
  "Competition",
  "Social",
  "Other",
];

// categorize event helper
async function categorizeEventHelper(event) {
  try {
    const prompt = `
    You are an expert in categorizing events.
    Given an event name, description, and tags, categorize it into one of the following categories:
    ${EVENT_CATEGORIES.join(", ")}

    Event Name: ${event.name}
    Event Description: ${event.description}
    Event Tags: ${event.tags.join(", ")}

    Return the category in the following JSON format:
    if any subCategory is found, it should be an array of strings with less than 3 categories.
    {
      "primaryCategory": "<category>",
      "subCategory": ["<sub-category>"]
    }
    `;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an expert in categorizing events.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = response.choices[0].message.content;
    const cleaned = raw
      .replace(/```json/g, "")
      .replace(/```/g, "")
      .trim();

    const category = JSON.parse(cleaned);
    return category;
  } catch (error) {
    console.log("Error categorizing event:", error);
    return null;
  }
}

const categorizeAllEvents = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const events = await Event.find(
      {
        primaryCategory: {
          $exists: false,
          $eq: null,
        },
        secondaryCategories: {
          $exists: false,
          $eq: null,
        },
      },
      {
        name: 1,
        slug: 1,
        description: 1,
        tags: 1,
      },
    );

    console.log("Events found without category", events.length);

    let updatedEvents = 0;
    for (const event of events) {
      const category = await categorizeEventHelper(event);
      console.log("category", category);
      if (category) {
        await Event.findByIdAndUpdate(event._id, {
          $set: {
            primaryCategory: category.primaryCategory,
            secondaryCategories: category.subCategory,
          },
        });
        updatedEvents++;
        console.log("updated", updatedEvents);
      }
    }
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Events categorized successfully.",
      updatedEvents,
    });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

const categorizeEvent = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Event ID is required.",
      });
    }
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized",
      });
    }
    const event = await Event.findById(
      {
        _id: eventId,
        primaryCategory: {
          $exists: false,
          $eq: null,
        },
        secondaryCategories: {
          $exists: false,
          $eq: null,
        },
      },
      {
        name: 1,
        slug: 1,
        description: 1,
        tags: 1,
      },
    );

    if (!event) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Event not found.",
      });
    }
    const category = await categorizeEventHelper(event);
    await Event.findByIdAndUpdate(eventId, {
      $set: {
        primaryCategory: category.primaryCategory,
        secondaryCategories: category.subCategory,
      },
    });
    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Event categorized successfully.",
    });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

const getEventsByCategory = async (req, res) => {
  try {
    const { categories } = req.body;

    if (!categories) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Categories are required.",
      });
    }
    const regexCategories = categories.map((cat) => new RegExp(cat, "i"));
    const events = await Event.aggregate([
      {
        $match: {
          $or: [
            { primaryCategory: { $in: regexCategories } },
            { secondaryCategories: { $in: regexCategories } },
          ],
        },
      },
      {
        $addFields: {
          isFeatured: {
            $cond: [{ $eq: ["$status", "featured"] }, 1, 0],
          },
          score: {
            $cond: [
              {
                $anyElementTrue: {
                  $map: {
                    input: categories,
                    as: "cat",
                    in: {
                      $regexMatch: {
                        input: "$primaryCategory",
                        regex: "$$cat",
                        options: "i",
                      },
                    },
                  },
                },
              },
              2,
              1,
            ],
          },
        },
      },
      {
        $sort: {
          isFeatured: -1, // featured first
          score: -1, // primary matches next
          eventDate: 1, // earlier events first
        },
      },
      {
        $project: {
          _id: 1,
          name: 1,
          slug: 1,
          belongsTo: 1,
          url: 1,
          eventDate: 1,
          description: 1,
          startTime: 1,
          endTime: 1,
          place: 1,
          status: 1,
          primaryCategory: 1,
          secondaryCategories: 1,
        },
      },
    ]);

    return res.status(StatusCodes.OK).json({
      success: true,
      events,
      count: events.length,
    });
  } catch (error) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

const getEventsByFilters = async (req, res) => {
  try {
    const { categories, statuses, mode, payment, page, limit } = req.body;
    const query = {};

    // Categories
    if (categories?.length) {
      query.$or = [
        { primaryCategory: { $in: categories } },
        { secondaryCategories: { $in: categories } },
      ];
    }

    // Status
    const allowedStatuses = ["featured", "expired", "pending"];
    if (statuses?.length) {
      const validStatuses = statuses.filter((s) => allowedStatuses.includes(s));
      if (!validStatuses.length) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid status." });
      }
      query.status = { $in: validStatuses };
    }

    // Mode
    const allowedModes = ["online", "offline"];
    if (mode && allowedModes.includes(mode)) {
      query.mode = mode;
    }

    // Payment
    const allowedPayments = ["paid", "free"];
    if (payment?.length) {
      const validPayments = payment.filter((p) => allowedPayments.includes(p));
      if (!validPayments.length) {
        return res
          .status(400)
          .json({ success: false, message: "Invalid payment." });
      }
      query.payment = { $in: validPayments };
    }

    // Pagination
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    const skip = (pageNum - 1) * limitNum;

    const events = await Event.find(query)
      .select(
        "_id name slug belongsTo url eventDate description startTime endTime place status primaryCategory secondaryCategories",
      )
      .skip(skip)
      .limit(limitNum)
      .sort({ eventDate: 1 })
      .lean();

    return res.status(StatusCodes.OK).json({
      success: true,
      events,
      count: events.length,
    });
  } catch (err) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

const addPaymentFieldToEvents = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const events = await Event.find({
      payment: { $exists: false },
      mode: { $exists: false },
    }).lean();

    console.log("Events found", events.length);

    const bulkOps = events.map((event) => {
      let payment = "free";

      if (event.ticketTypes?.length > 0) {
        const hasPaidTicket = event.ticketTypes.some((t) => t.price > 0);
        if (hasPaidTicket) payment = "paid";
      } else if (event.cumulativeRevenue?.length > 0) {
        const totalRevenue = event.cumulativeRevenue.reduce(
          (acc, curr) => acc + curr,
          0,
        );
        if (totalRevenue > 0) payment = "paid";
      }

      return {
        updateOne: {
          filter: { _id: event._id },
          update: { $set: { payment } },
        },
      };
    });

    if (bulkOps.length > 0) {
      await Event.bulkWrite(bulkOps);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      updatedCount: bulkOps.length,
    });
  } catch (err) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

const addModeFieldToEvents = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const events = await Event.find({
      mode: { $exists: false },
    }).lean();

    console.log("Events found", events.length);

    const bulkOps = events.map((event) => {
      let mode = "online";

      if (event.place) {
        mode = "offline";
      }

      return {
        updateOne: {
          filter: { _id: event._id },
          update: { $set: { mode } },
        },
      };
    });

    if (bulkOps.length > 0) {
      await Event.bulkWrite(bulkOps);
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      updatedCount: bulkOps.length,
    });
  } catch (err) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

const getEventsByUid = async (req, res) => {
  try {
    const { uid } = req.query;
    const { fields } = req.body;

    const defaultProjection = {
      _id: 1,
      name: 1,
      slug: 1,
      belongsTo: 1,
      url: 1,
      eventDate: 1,
      description: 1,
      startTime: 1,
      endTime: 1,
      place: 1,
      status: 1,
      primaryCategory: 1,
      secondaryCategories: 1,
    };

    let fieldProjection = {};

    if (fields && fields.length > 0) {
      fields.forEach((field) => {
        if (field) {
          fieldProjection[field] = 1;
        }
      });
    } else {
      fieldProjection = defaultProjection;
    }

    const events = await Event.find(
      { uid },
      fieldProjection
    );

    return res.status(StatusCodes.OK).json({
      success: true,
      events,
      count: events.length,
    });

  } catch (err) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

const updateEventExtraFields = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.UNAUTHORIZED).json({
        success: false,
        message: "Unauthorized.",
      });
    }

    const { eventId, extraFields } = req.body;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Event not found.",
      });
    }

    if (!event.extraFieldsRequired) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Event does not have extra fields required.",
      });
    }

    if (!Array.isArray(extraFields)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "extraFields must be an array." });
    }

    // Validate individual field structures
    for (const field of extraFields) {
      if (!field.fieldName || !field.type) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          message: "Each extraField must contain fieldName and type.",
        });
      }
      const allowedTypes = ["String", "Number", "Boolean", "Date", "Enum", "Doc"];
      if (!allowedTypes.includes(field.type)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          message: `Invalid type "${field.type
            }". Allowed types are: ${allowedTypes.join(", ")}`,
        });
      }
    }
    if (extraFields.length === 0) {
      event.extraFieldsRequired = false;
      event.extraFields = undefined;
    } else {
      event.extraFieldsRequired = true;
      event.extraFields = extraFields;

    }

    await event.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      event,
    });
  } catch (err) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
};

const updateTicketTypeExtraFields = async (req, res) => {
  try {
    const { eventId, type, extraFields } = req.body;

    const event = await Event.findById(eventId);

    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Event not found.",
      });
    }

    const idx = event.ticketTypes.findIndex((t) => t.type === type);

    if (idx === -1) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Ticket type not found inside ticketTypes.",
      });
    }

    if (!Array.isArray(extraFields)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "extraFields must be an array." });
    }

    // Validate individual field structures
    for (const field of extraFields) {
      if (!field.fieldName || !field.type) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          message: "Each extraField must contain fieldName and type.",
        });
      }
      const allowedTypes = ["String", "Number", "Boolean", "Date", "Enum", "Doc"];
      if (!allowedTypes.includes(field.type)) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          message: `Invalid type "${field.type
            }". Allowed types are: ${allowedTypes.join(", ")}`,
        });
      }
    }

    if (extraFields.length === 0) {
      event.ticketTypes[idx].extraFieldsRequired = false;
      event.ticketTypes[idx].extraFields = undefined;
    } else {
      event.ticketTypes[idx].extraFieldsRequired = true;
      event.ticketTypes[idx].extraFields = extraFields;
    }
    await event.save();

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Extra fields updated successfully."
    });
  } catch (err) {
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Something went wrong.",
    });
  }
}

const updateMouStatus = async (req, res) => {
  try {
    const { eventId, mouStatus, mouId } = req.body;

    if (!eventId || !mouStatus) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "eventId and mouStatus are required."
      });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Event not found."
      });
    }

    event.mouStatus = mouStatus;
    if (mouId) {
      event.mouId = mouId;
    }

    // Optionally update event.status to featured or active if mouStatus becomes "signed"
    // Though the prompt says "admin will manually change event status to featured", we just update mouStatus here.
    
    await event.save();

    return res.status(StatusCodes.OK).json({ success: true, message: "MOU status updated successfully" });
  } catch (error) {
    console.error("updateMouStatus error:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "Internal server error" });
  }
};

module.exports = {
  createEvent,
  getAllEvents,
  changeEventStatus,
  deleteEvent,
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
  setEventLayout,
  editEventDetails,
  searchEvents,
  mailEventStats,
  getPastOrFutureEvents,
  getEventFieldsById,
  checkEventAuthorization,
  getPastEvents,
  getEventGallery,
  addExtraFieldsToEvent,
  promoteEvent,
  demoteEvent,
  getEventPermissions,
  assignDefaultPermissions,
  updateEventPermission,
  addToGallery,
  getEventGalleryPaginated,
  getEventGalleryContributors,
  changeGalleryFeatured,
  addTagsToEvent,
  getCurrentWeekEvents,
  getPromotedEvents,
  getTopPastEvents,
  addExtraFieldsToTicketType,
  getLatestEvents,
  toggleWaitlist,
  getSearchedEvents,
  insertNewFields,
  getFeaturedEvents,
  getFeaturedEventsForFeed,
  requestCancellation,
  requestPostponement,
  requestEventLive,
  cancelEvent,
  slugifyAllEvents,
  canBuyTicket,
  getTopEvents,
  getLiveEvents,
  getCategories,
  categorizeAllEvents,
  categorizeEvent,
  getEventsByCategory,
  getEventsByFilters,
  addPaymentFieldToEvents,
  addModeFieldToEvents,
  getEventsByUid,
  updateEventExtraFields,
  updateTicketTypeExtraFields,
  updateMouStatus
};
