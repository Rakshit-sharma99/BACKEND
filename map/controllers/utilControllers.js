const jwt = require("jsonwebtoken");
const axios = require("axios");

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

const fetchAllClubs = async (query) => {
  try {
    
    const config = generateServiceToken();
    const clubData = await axios.post(
      `http://universe:5050/universe/api/v1/club/getAllClubs`,
      query,
      config
    );
    return clubData.data.data;
  } catch (error) {
    console.log(error);
    return []
  }
};

const fetchAllCommunities = async (query) => {
  try {
    
    const config = generateServiceToken();
    const communityData = await axios.post(
      `http://universe:5050/universe/api/v1/community/getAllCommunity`,
      query,
      config
    );
    return communityData.data.data;
  } catch (error) {
    console.log(error);
    return []
  }
};

const fetchClubById = async (query) => {
  try {
    if(!query.id){
      return null;
    }
    const config = generateServiceToken();
    const clubData = await axios.post(
      `http://universe:5050/universe/api/v1/club/getClubById`,
      query,
      config
    );
    return clubData.data.data;
  } catch (error) {
    console.log(error);
    return null;
  }
};

const fetchCommunityById = async (query) => {
  try {
    if(!query.id){
      return null;
    }
    const config = generateServiceToken();
    const communityData = await axios.post(
      `http://universe:5050/universe/api/v1/community/getCommunityFieldsById`,
      query,
      config
    );
    return communityData.data.data;
  } catch (error) {
    console.log(error);
    return null;
  }
};

module.exports = {
    fetchAllClubs,
    fetchAllCommunities,
    fetchClubById,
    fetchCommunityById
}