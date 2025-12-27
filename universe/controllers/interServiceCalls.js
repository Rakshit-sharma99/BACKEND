const jwt = require("jsonwebtoken");
const axios = require("axios");

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: process.env.KAFKA_CLIENT_ID,
      role: "internal",
    },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" }
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
    if (!Array.isArray(query.ids) || query.ids.length === 0) return;

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

    const url = `http://content:5000/content/api/v1/getMultipleContents`;

    const contentData = await axios.post(url, body, config);

    return contentData.data;
  } catch (error) {
    console.error("Error in fetchMultipleContents:", error.message);
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

   const isArrayProjection =
      Array.isArray(fields) && fields.length > 0;

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
      config
    );
    return eventData.data.data;
  } catch (error) {
    console.log("Error fetching event data:",error);
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
      config
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
      config
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
      config
    );
    return couponData.data.coupons;
  } catch (error) {
    console.log(error);
  }
};


module.exports = {
  fetchContent,
  fetchMultipleContents,
  searchContentsFromIds,
  searchCardsFromTags,
  fetchEventData,
  fetchPastEvents,
  fetchEventGallery,
  fetchCouponById
};
