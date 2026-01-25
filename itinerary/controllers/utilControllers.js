const jwt = require("jsonwebtoken");
const axios = require("axios");

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "itinerary",
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

const fetchEventData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
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
    console.log(error);
  }
};

const checkEventAuthorization = async (query) => {
  try {
    const { userId, eventId } = query;

    if (!userId || !eventId) {
      console.warn("❗ Missing userId or eventId in authorization check.");
      return false;
    }

    const config = generateServiceToken();

    const response = await axios.get(
      `http://event:5060/event/api/v1/checkEventAuthorization?eventId=${eventId}&userId=${userId}`,
      config
    );

    return response?.data?.authorized === true;
  } catch (error) {
    console.error("❌ Error in checkEventAuthorization:", error.message);
    return false; // Always fail-safe on errors
  }
};

const getUserMetaMap = async (userIds, fields) => {
  try {
    if (!Array.isArray(userIds) || !Array.isArray(fields)) {
      return;
    }
    const config = generateServiceToken();
    const { data } = await axios.post(
      "http://universe:5050/universe/api/v1/user/fetchBulkUsers",
      {
        userIds,
        fields,
      },
      config
    );

    return data.reduce((acc, user) => {
      acc[user._id] = user;
      return acc;
    }, {});
  } catch (err) {
    console.error("❌ Failed to fetch user metadata:", err.message);
    return {};
  }
};

const fetchTicketFieldsById = async (query) => {
  try {
    if (!query.ticketId || !Array.isArray(query.fields)) {
      return;
    }
    const config = generateServiceToken();
    const ticketData = await axios.post(
      `http://ticket:6000/ticket/api/v1/getTicketFieldsById`,
      query,
      config
    );
    return ticketData.data.data;
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  fetchEventData,
  checkEventAuthorization,
  getUserMetaMap,
  fetchTicketFieldsById,
};
