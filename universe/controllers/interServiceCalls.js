const jwt = require("jsonwebtoken");
const axios = require("axios");
const { query } = require("express");

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

    const url = `http://content:5000/content/api/v1/getContent?${params.toString()}`;

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

    const url = `http://content:5000/content/api/v1/getMultipleContents`;

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

    const url = `http://map:7050/map/api/v1/asset/getMultipleAssets`;
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

    const url = `http://content:5000/content/api/v1/searchContentFromIds`;

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

    const url = `http://card:5030/card/api/v1/getCardsFromTag`;

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
      "http://event:5060/event/api/v1/getEventFieldsById",
      query,
      config,
    );
    return eventData.data.data;
  } catch (error) {
    console.log("Error fetching event data:", error);
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
      "http://event:5060/event/api/v1/getPastEvents",
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
    console.log("Error fetching past events:", error);
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
      "http://event:5060/event/api/v1/getEventGallery",
      { eventIds },
      config,
    );

    return response.data.data;
  } catch (error) {
    console.log("Error fetching event gallery:", error);
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
      `http://coupon:7020/coupon/api/v1/getCouponById?couponId=${query.couponId}&eventId=${query.eventId}&userId=${query.userId}`,
      config,
    );
    return couponData.data.coupons;
  } catch (error) {
    console.log(error);
  }
};

const fetchSearchedEvents = async (query) => {
  try {
    if (!query) {
      return [];
    }

    const config = generateServiceToken();

    const response = await axios.get(
      `http://event:5060/event/api/v1/getSearchedEvents?query=${query}`,
      config,
    );

    return response.data.data;
  } catch (error) {
    console.log("Error fetching searched events:", error);
    return [];
  }
};

const fetchSearchedCards = async (query) => {
  try {
    if (!query) {
      return [];
    }

    const config = generateServiceToken();

    const response = await axios.get(
      `http://card:5030/card/api/v1/getSearchedCards?query=${query}`,
      config,
    );

    return response.data.data;
  } catch (error) {
    console.log("Error fetching searched cards:", error);
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
      `http://memory:7030/memory/api/v1/getMemoryCount?userId=${query}`,
      config,
    );

    return res.data.data;
  } catch (err) {
    console.log("Error getting memory count:", err);
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
      `http://ticket:6000/ticket/api/v1/getTicketFieldsByQuery`,
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
      "http://event:5060/event/api/v1/getFeaturedEvents",
      query,
      config,
    );
    return eventData.data.data;
  } catch (error) {
    console.log("Error fetching featured event data:", error);
  }
};

const fetchAllowedDomains = async (universeId) => {
  try {
    if (!universeId) return [];

    const config = generateServiceToken();

    const params = new URLSearchParams({ universeId });

    const url = `http://multiverse:5020/multiverse/api/v1/universe/getAllowedDomains?${params.toString()}`;

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
    
    const url = `http://map:7050/map/api/v1/nodes/metaSearchProfileFacets`;
    const response = await axios.post(url, body, config);
    
    return response.data;
  } catch (error) {
    console.error("Error in fetchSearchedProfileFacets:", error.message);
    return [];
  }
};

module.exports = {
  fetchContent,
  fetchMultipleContents,
  fetchMultipleAssets,
  searchContentsFromIds,
  searchCardsFromTags,
  fetchEventData,
  fetchPastEvents,
  fetchEventGallery,
  fetchCouponById,
  fetchSearchedEvents,
  fetchSearchedCards,
  getMemoryCount,
  fetchTicketFieldsByQuery,
  fetchFeaturedEvent,
  fetchAllowedDomains,
  fetchSearchedProfileFacets,
};
