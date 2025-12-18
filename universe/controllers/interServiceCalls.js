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

module.exports = {
  fetchContent,
  fetchMultipleContents,
  searchContentsFromIds,
  searchCardsFromTags,
};
