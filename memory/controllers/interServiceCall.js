const axios = require("axios");
const jwt = require("jsonwebtoken");

const services = {
  universe: "universe:5050"
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

const fetchNativeUserData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0 ||
      !query.callSign
    ) {
      return;
    }
    const service = services[query.callSign];
    const config = generateServiceToken();
    if (!service) return;
    const userData = await axios.post(
      `http://${service}/${query.callSign}/api/v1/user/getUserFieldsById`,
      query,
      config
    );
    return userData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchClubData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const clubData = await axios.post(
      "http://universe:5050/universe/api/v1/club/getClubFieldsById",
      query,
      config
    );
    return clubData.data.data;
  } catch (error) {
    console.log(error);
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


    return data
  } catch (err) {
    console.error("❌ Failed to fetch user metadata:", err.message);
    return {};
  }
};

const fetchUsersByFields = async (body) => {
  try {
    const config = generateServiceToken();
    const { data } = await axios.post(
      "http://universe:5050/universe/api/v1/user/getUsersByFields",
      body,
      config
    );

    return data
  } catch (err) {
    console.error("❌ Failed to fetch user metadata:", err.message);
    return {};
  }
};

const fetchMacbeaseContentByField = async (body) => {
  try {
    const config = generateServiceToken();
    const macbeaseContent = await axios.post(
      `http://macbeaseContent:5070/macbeaseContent/api/v1/getMacbeaseContentByField`,
      body,
      config
    );
    return macbeaseContent.data;
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  fetchNativeUserData,
  fetchClubData,
  getUserMetaMap,
  fetchMacbeaseContentByField,
  fetchUsersByFields
}