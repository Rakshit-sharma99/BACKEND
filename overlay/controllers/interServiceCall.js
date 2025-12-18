const axios = require("axios");
const jwt = require("jsonwebtoken");

const services = {
    universe:"universe:5050"
};

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "content",
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
      config
    );

    return response.data.data;
  } catch (error) {
    console.error("fetchTicketFieldsByQuery error:", error.response?.data || error.message);
    return null;
  }
};

module.exports = {
    fetchTicketFieldsByQuery
}