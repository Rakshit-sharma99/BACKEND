const jwt = require("jsonwebtoken");
const axios = require("axios");
const { query } = require("express");

const CONTENT_SERVICE_URL = process.env.CONTENT_SERVICE_URL || "http://content:5000";
const CARD_SERVICE_URL = process.env.CARD_SERVICE_URL || "http://card:5030";
const EVENT_SERVICE_URL = process.env.EVENT_SERVICE_URL || "http://event:5060";
const MAP_SERVICE_URL = process.env.MAP_SERVICE_URL || "http://map:7050";
const MULTIVERSE_SERVICE_URL = process.env.MULTIVERSE_URL || "http://multiverse:5020";
const COUPON_SERVICE_URL = process.env.COUPON_SERVICE_URL || "http://coupon:7020";
const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || "http://memory:7030";
const TICKET_SERVICE_URL = process.env.TICKET_SERVICE_URL || "http://ticket:6000";

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: process.env.KAFKA_CLIENT_ID,
      role: "internal",
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
  return {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
};

const fetchContent = async (query) => {
  try {
    if (!query.contentId) return;

    const config = generateServiceToken();

    // Build query params safely
    const params = new URLSearchParams({ contentId: query.contentId });

    if (
      typeof query.select === "string" &&
      query.select.trim() !== "" &&
      query.select.trim() !== "undefined"
    ) {
      params.append("select", query.select.trim());
    }

    const url = `${CONTENT_SERVICE_URL}/content/api/v1/getContent?${params.toString()}`;

    const contentData = await axios.get(url, config);

    return contentData.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchMultipleContents = async (query) => {
  try {
    if (!Array.isArray(query.ids) || query.ids.length === 0) return [];

    const config = generateServiceToken();

    const body = { ids: query.ids };

    if (
      typeof query.select === "string" &&
      query.select.trim() !== "" &&
      query.select.trim() !== "undefined"
    ) {
      body.select = query.select.trim();
    }

    // Add 'filters' only if it's a valid non-null object
    if (
      query.filters &&
      typeof query.filters === "object" &&
      !Array.isArray(query.filters)
    ) {
      body.filters = query.filters;
    }

    if (query.userId) {
      body.userId = query.userId;
    }

    const url = `${CONTENT_SERVICE_URL}/content/api/v1/getMultipleContents`;

    const contentData = await axios.post(url, body, config);

    return contentData.data;
  } catch (error) {
    console.error("Error in fetchMultipleContents:", error.message);
    return [];
  }
};

const fetchMultipleAssets = async (query) => {
  try {
    if (!Array.isArray(query.ids) || query.ids.length === 0) return [];

    const config = generateServiceToken();
    const body = { ids: query.ids };

    const url = `${MAP_SERVICE_URL}/map/api/v1/asset/getMultipleAssets`;
    const assetData = await axios.post(url, body, config);

    return assetData.data.data;
  } catch (error) {
    console.error("Error in fetchMultipleAssets:", error.message);
    return [];
  }
};

const searchContentsFromIds = async (query) => {
  try {
    if (!Array.isArray(query.contentIds) || query.contentIds.length === 0)
      return;

    const config = generateServiceToken();

    const body = { contentIds: query.contentIds };

    if (
      typeof query.contentType === "string" &&
      query.contentType.trim() !== "" &&
      query.contentType.trim() !== "undefined"
    ) {
      body.contentType = query.contentType.trim();
    }

    if (
      typeof query.search === "string" &&
      query.search.trim() !== "" &&
      query.search.trim() !== "undefined"
    ) {
      body.search = query.search.trim();
    }

    const url = `${CONTENT_SERVICE_URL}/content/api/v1/searchContentFromIds`;

    const contentData = await axios.post(url, body, config);

    return contentData.data;
  } catch (error) {
    console.error("Error in fetchMultipleContents:", error.message);
  }
};

const searchCardsFromTags = async (query) => {
  try {
    if (!query || (typeof query !== "string" && !Array.isArray(query))) return;

    const config = generateServiceToken();

    const body = { tag: query };

    const url = `${CARD_SERVICE_URL}/card/api/v1/getCardsFromTag`;

    const cardsData = await axios.post(url, body, config);

    return cardsData.data;
  } catch (error) {
    console.error("Error in searchCardsFromTags:", error.message);
  }
};

const fetchEventData = async (query) => {
  try {
    const { id, ids, fields } = query;

    const isArrayProjection = Array.isArray(fields) && fields.length > 0;

    const isObjectProjection =
      fields &&
      typeof fields === "object" &&
      !Array.isArray(fields) &&
      Object.keys(fields).length > 0;

    if (!isArrayProjection && !isObjectProjection) {
      return;
    }

    // Validate id or ids
    const hasSingleId = !!id;
    const hasMultipleIds = Array.isArray(ids) && ids.length > 0;

    if (!hasSingleId && !hasMultipleIds) {
      return;
    }

    const config = generateServiceToken();
    const eventData = await axios.post(
      `${EVENT_SERVICE_URL}/event/api/v1/getEventFieldsById`,
      query,
      config,
    );
    return eventData.data.data;
  } catch (error) {
    console.error("Error fetching event data:", error.message);
  }
};

const verifyTicketPurchaseAccess = async ({
  eventId,
  ticketType,
  privateCode,
  uid,
  userId,
}) => {
  try {
    if (!eventId || !ticketType || !userId) {
      return {
        success: false,
        canBuy: false,
        message: "Missing eventId, ticketType or userId",
      };
    }

    const config = generateServiceToken();
    const response = await axios.post(
      `${EVENT_SERVICE_URL}/event/api/v1/canBuyTicket`,
      {
        eventId,
        ticketType,
        privateCode,
        uid,
        userId,
      },
      config,
    );

    return response.data;
  } catch (error) {
    return (
      error.response?.data || {
        success: false,
        canBuy: false,
        message: "Unable to verify ticket access",
      }
    );
  }
};

const updateEventLayout = async ({ eventId, layoutId }) => {
  try {
    if (!eventId || !layoutId) {
      return null;
    }

    const config = generateServiceToken();
    const response = await axios.post(
      `${EVENT_SERVICE_URL}/event/api/v1/setEventLayout`,
      {
        eventId,
        layoutId,
      },
      config,
    );

    return response.data?.event || null;
  } catch (error) {
    console.error("updateEventLayout error:", error.message);
    return null;
  }
};

const fetchPastEvents = async ({
  monthsAgo,
  daysAgo,
  startDate,
  projection,
  limit,
}) => {
  try {
    const config = generateServiceToken();

    const response = await axios.post(
      `${EVENT_SERVICE_URL}/event/api/v1/getPastEvents`,
      {
        monthsAgo,
        daysAgo,
        startDate,
        projection,
        limit,
      },
      config,
    );

    return response.data.data;
  } catch (error) {
    console.error("Error fetching past events:", error.message);
    return [];
  }
};

const fetchEventGallery = async (eventIds) => {
  try {
    if (!Array.isArray(eventIds) || eventIds.length === 0) {
      return [];
    }

    const config = generateServiceToken();

    const response = await axios.post(
      `${EVENT_SERVICE_URL}/event/api/v1/getEventGallery`,
      { eventIds },
      config,
    );

    return response.data.data;
  } catch (error) {
    console.error("Error fetching event gallery:", error.message);
    return [];
  }
};

const fetchCouponById = async (query) => {
  try {
    if (!query.couponId || !query.eventId || !query.userId) {
      return;
    }
    const config = generateServiceToken();
    const couponData = await axios.get(
      `${COUPON_SERVICE_URL}/coupon/api/v1/getCouponById?couponId=${query.couponId}&eventId=${query.eventId}&userId=${query.userId}`,
      config,
    );
    return couponData.data.coupons;
  } catch (error) {
    console.error("Error fetching coupon by id:", error.message);
  }
};

const generateUserAuthConfig = (user) => {
  const token = jwt.sign(
    {
      role: user?.role || "user",
      id: user?.id,
      uid: user?.uid,
      callSign: user?.callSign,
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );

  return {
    headers: {
      authorization: `Bearer ${token}`,
    },
  };
};

const generateTicketWithoutPayment = async ({ user, body }) => {
  if (!user?.id) {
    throw new Error("User context is required to generate a ticket");
  }

  const response = await axios.post(
    `${TICKET_SERVICE_URL}/ticket/api/v1/generateTicket`,
    body,
    generateUserAuthConfig(user),
  );

  return response.data;
};

const fetchSearchedEvents = async (query, { page = 1, limit = 12, seenIds = [] } = {}) => {
  try {
    if (!query) {
      return [];
    }

    const config = generateServiceToken();

    let url = `${EVENT_SERVICE_URL}/event/api/v1/getSearchedEvents?query=${query}&page=${page}&limit=${limit + 1}`;
    if (seenIds && seenIds.length > 0) {
      url += `&seenIds=${seenIds.join(',')}`;
    }

    const response = await axios.get(url, config);

    return response.data.data;
  } catch (error) {
    console.error("Error fetching searched events:", error.message);
    return [];
  }
};

const fetchSearchedCards = async (query, { page = 1, limit = 12, seenIds = [] } = {}) => {
  try {
    if (!query) {
      return [];
    }

    const config = generateServiceToken();

    let url = `${CARD_SERVICE_URL}/card/api/v1/getSearchedCards?query=${query}&page=${page}&limit=${limit + 1}`;
    if (seenIds && seenIds.length > 0) {
      url += `&seenIds=${seenIds.join(',')}`;
    }

    const response = await axios.get(url, config);

    return response.data.data;
  } catch (error) {
    console.error("Error fetching searched cards:", error.message);
    return [];
  }
};

const getMemoryCount = async (query) => {
  try {
    if (!query) {
      return 0;
    }

    const config = generateServiceToken();

    const res = await axios.get(
      `${MEMORY_SERVICE_URL}/memory/api/v1/getMemoryCount?userId=${query}`,
      config,
    );

    return res.data.data;
  } catch (err) {
    if (err.code !== "ENOTFOUND") {
      console.error("Error getting memory count:", err.message);
    }
    return 0;
  }
};

const fetchTicketFieldsByQuery = async (query) => {
  try {
    const { searchBy, fields, single } = payload;

    if (
      !searchBy ||
      typeof searchBy !== "object" ||
      !Array.isArray(fields) ||
      fields.length === 0
    ) {
      return null;
    }

    const config = generateServiceToken();

    const response = await axios.post(
      `${TICKET_SERVICE_URL}/ticket/api/v1/getTicketFieldsByQuery`,
      {
        searchBy,
        fields,
        single,
      },
      config,
    );

    return response.data.data;
  } catch (error) {
    console.error(
      "fetchTicketFieldsByQuery error:",
      error.response?.data || error.message,
    );
    return null;
  }
};

const fetchFeaturedEvent = async (query) => {
  try {
    const { fields } = query;

    const isArrayProjection = Array.isArray(fields) && fields.length > 0;

    const isObjectProjection =
      fields &&
      typeof fields === "object" &&
      !Array.isArray(fields) &&
      Object.keys(fields).length > 0;

    if (!isArrayProjection && !isObjectProjection) {
      return;
    }

    const config = generateServiceToken();
    const eventData = await axios.post(
      `${EVENT_SERVICE_URL}/event/api/v1/getFeaturedEvents`,
      query,
      config,
    );
    return eventData.data.data;
  } catch (error) {
    console.error("Error fetching featured event data:", error.message);
  }
};

const fetchAllowedDomains = async (universeId) => {
  try {
    if (!universeId) return [];

    const config = generateServiceToken();

    const params = new URLSearchParams({ universeId });

    const url = `${MULTIVERSE_SERVICE_URL}/multiverse/api/v1/universe/getAllowedDomains?${params.toString()}`;

    const response = await axios.get(url, config);

    if (response.data && response.data.success) {
      return response.data.allowedDomains;
    }

    return [];
  } catch (error) {
    console.error("fetchAllowedDomains error:", error.message);
    return [];
  }
};

const fetchSearchedProfileFacets = async (query) => {
  try {
    if (!query) return [];

    const config = generateServiceToken();
    const body = { metaQuery: query, limit: 50 };
    
    const url = `${MAP_SERVICE_URL}/map/api/v1/nodes/metaSearchProfileFacets`;
    const response = await axios.post(url, body, config);
    
    return response.data;
  } catch (error) {
    console.error("Error in fetchSearchedProfileFacets:", error.message);
    return [];
  }
};

const registerCustomUniverse = async (customUniverse, userId) => {
  try {
    const config = generateServiceToken();
    const multiverseUrl = MULTIVERSE_SERVICE_URL;
    
    await axios.post(
      `${multiverseUrl}/multiverse/api/v1/universe/createCustomUniverse`,
      {
        ...customUniverse,
        userId: userId.toString(),
      },
      config
    );
  } catch (error) {
    console.error(
      "Failed to register custom universe to multiverse service:",
      error.message
    );
  }
};


const fetchAssetCategories = async () => {
  try {
    const config = generateServiceToken();
    const url = `${MAP_SERVICE_URL}/map/api/v1/asset/getAssetCategories`;
    const response = await axios.get(url, config);
    return response.data.data || [];
  } catch (error) {
    console.error("Error in fetchAssetCategories:", error.message);
    return [];
  }
};

const fetchTrendingEvents = async ({ limit = 6 }) => {
  try {
    const config = generateServiceToken();

    // 1. Fetch live (featured) events
    const liveRes = await axios.post(
      `${EVENT_SERVICE_URL}/event/api/v1/getFeaturedEvents`,
      {
        fields: [
          "name",
          "url",
          "description",
          "place",
          "startTime",
          "endTime",
          "eventDate",
          "eventEndDate",
          "status",
          "belongsTo",
          "tags",
          "primaryCategory",
        ],
      },
      config,
    );

    let events = liveRes.data?.data || [];

    // 2. If not enough live events, pad with recently expired ones
    if (events.length < limit) {
      const needed = limit - events.length;
      const pastRes = await axios.post(
        `${EVENT_SERVICE_URL}/event/api/v1/getPastEvents`,
        {
          daysAgo: 30,
          projection: "name url description place startTime endTime eventDate eventEndDate status belongsTo tags primaryCategory",
          limit: needed,
        },
        config,
      );

      const pastEvents = pastRes.data?.data || [];
      const existingIds = new Set(events.map((e) => e._id.toString()));
      for (const pe of pastEvents) {
        if (!existingIds.has(pe._id.toString())) {
          events.push(pe);
        }
        if (events.length >= limit) break;
      }
    }

    return events.slice(0, limit);
  } catch (error) {
    console.error("Error in fetchTrendingEvents:", error.message);
    return [];
  }
};

const fetchTrendingCards = async ({ tags, limit = 6 }) => {
  try {
    const config = generateServiceToken();
    let cards = [];

    if (Array.isArray(tags) && tags.length > 0) {
      const cardsRes = await axios.post(
        `${CARD_SERVICE_URL}/card/api/v1/getCardsFromTag`,
        { tag: tags },
        config,
      );
      cards = Array.isArray(cardsRes.data) ? cardsRes.data : [];
    }

    // Pad with random cards if we dont have enough
    if (cards.length < limit) {
      const needed = limit - cards.length;
      try {
        const randomRes = await axios.get(
          `${CARD_SERVICE_URL}/card/api/v1/getRandomCards?size=${needed * 2}`,
          config
        );
        const randomCards = Array.isArray(randomRes.data) ? randomRes.data : [];
        const existingIds = new Set(cards.map((c) => c._id.toString()));
        for (const rc of randomCards) {
          if (!existingIds.has(rc._id.toString())) {
            cards.push(rc);
          }
          if (cards.length >= limit) break;
        }
      } catch (err) {
        console.error("Error fetching random cards for padding:", err.message);
      }
    }

    return cards.slice(0, limit);
  } catch (error) {
    console.error("Error in fetchTrendingCards:", error.message);
    return [];
  }
};

const fetchSearchedContents = async (query, { page = 1, limit = 12, seenIds = [] } = {}) => {
  try {
    if (!query) return [];

    const config = generateServiceToken();

    let url = `${CONTENT_SERVICE_URL}/content/api/v1/searchContentByTag?query=${encodeURIComponent(query)}`;
    if (seenIds && seenIds.length > 0) {
      url += `&seenIds=${seenIds.join(',')}`;
    }

    const response = await axios.get(url, config);

    const results = response.data?.actualContent || [];

    // Apply pagination on the returned results
    const skip = seenIds && seenIds.length > 0 ? 0 : (page - 1) * limit;
    return results.slice(skip, skip + limit + 1).map((item) => ({
      ...item,
      type: "content",
      score: 1, // tag-match score placeholder
    }));
  } catch (error) {
    console.error("Error fetching searched contents:", error.message);
    return [];
  }
};

const fetchAssetByPayloadType = async (payloadType) => {
  try {
    if (!payloadType) return null;

    const config = generateServiceToken();
    const url = `${MAP_SERVICE_URL}/map/api/v1/asset/getAssetByPayloadType?payloadType=${payloadType}`;
    const response = await axios.get(url, config);

    return response.data?.asset || null;
  } catch (error) {
    console.error("Error in fetchAssetByPayloadType:", error.message);
    return null;
  }
};

module.exports = {
  fetchContent,
  fetchMultipleContents,
  fetchMultipleAssets,
  fetchAssetByPayloadType,
  searchContentsFromIds,
  searchCardsFromTags,
  fetchEventData,
  verifyTicketPurchaseAccess,
  fetchPastEvents,
  fetchEventGallery,
  fetchCouponById,
  generateTicketWithoutPayment,
  fetchSearchedEvents,
  fetchSearchedCards,
  fetchSearchedContents,
  getMemoryCount,
  fetchTicketFieldsByQuery,
  fetchFeaturedEvent,
  updateEventLayout,
  fetchAllowedDomains,
  fetchSearchedProfileFacets,
  registerCustomUniverse,
  fetchAssetCategories,
  fetchTrendingEvents,
  fetchTrendingCards,
};
