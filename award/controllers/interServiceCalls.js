const jwt = require("jsonwebtoken");
const axios = require("axios");

const UNIVERSE_SERVICE_URL = process.env.UNIVERSE_SERVICE_URL || "http://universe:5050";
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

/**
 * Fetch club data from universe service
 * @param {string} clubId
 * @param {string[]} fields - Fields to project (e.g. ["name", "permissions", "awards"])
 */
const fetchClubData = async (clubId, fields = []) => {
  try {
    if (!clubId) return null;

    const config = generateServiceToken();

    const response = await axios.post(
      `${UNIVERSE_SERVICE_URL}/universe/api/v1/club/getClubFieldsById`,
      { id: clubId, fields },
      config,
    );

    return response.data?.data || null;
  } catch (error) {
    console.error("fetchClubData error:", error.message);
    return null;
  }
};

/**
 * Fetch user data from universe service
 * @param {string} userId
 * @param {string[]} fields - Fields to project
 */
const fetchUserData = async (userId, fields = []) => {
  try {
    if (!userId) return null;

    const config = generateServiceToken();

    const response = await axios.post(
      `${UNIVERSE_SERVICE_URL}/universe/api/v1/user/getUserFieldsById`,
      { id: userId, fields },
      config,
    );

    return response.data?.data || null;
  } catch (error) {
    console.error("fetchUserData error:", error.message);
    return null;
  }
};

/**
 * Update club award count in universe service
 */
const updateClubAwardCount = async (clubId, awardId, delta) => {
  try {
    if (!clubId || !awardId) return null;

    const config = generateServiceToken();

    const response = await axios.post(
      `${UNIVERSE_SERVICE_URL}/universe/api/v1/club/updateClubAwardCount`,
      { clubId, awardId, delta },
      config,
    );

    return response.data;
  } catch (error) {
    console.error("updateClubAwardCount error:", error.message);
    return null;
  }
};

/**
 * Save in-app notification to user
 */
const pushNoticeToUser = async (userId, notice) => {
  try {
    if (!userId || !notice) return null;

    const config = generateServiceToken();

    const response = await axios.post(
      `${UNIVERSE_SERVICE_URL}/universe/api/v1/user/pushNotice`,
      { userId, notice },
      config,
    );

    return response.data;
  } catch (error) {
    console.error("pushNoticeToUser error:", error.message);
    return null;
  }
};

/**
 * Fetch ticket fields by query from ticket service
 */
const fetchTicketFieldsByQuery = async (payload) => {
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

module.exports = {
  generateServiceToken,
  fetchClubData,
  fetchUserData,
  updateClubAwardCount,
  pushNoticeToUser,
  fetchTicketFieldsByQuery,
};
