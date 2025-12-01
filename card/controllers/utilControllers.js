const jwt = require("jsonwebtoken");
const axios = require("axios");
const nlp = require("compromise");

const services = {
  universe: "universe-srv:5050",
};

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "card",
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

//function for lemmatization
function lemmatize(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return [];
  }
  return tags.map((tag) => {
    let words = tag.split(" ");

    let lemmatizedWords = words.map((word) => {
      const doc = nlp(word);
      let lemma = doc.verbs().toInfinitive().out(); // Get base form if verb

      // If lemma is empty, keep original word
      if (!lemma) return word;

      // Maintain proper capitalization
      return lemma.charAt(0).toUpperCase() + lemma.slice(1);
    });

    return lemmatizedWords.join(" "); // Reconstruct phrase
  });
}

const fetchUserData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const userData = await axios.post(
      "http://multiverse-srv:5020/multiverse/api/v1/user/getUserFieldsById",
      query,
      config
    );
    return userData.data.data;
  } catch (error) {
    console.log(error);
  }
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

const fetchMultipleClubsData = async (query) => {
  try {
    if (
      !Array.isArray(query.ids) ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const clubData = await axios.post(
      "http://multiverse-srv:5020/multiverse/api/v1/club/fetchMultipleClubsFromIds",
      query,
      config
    );
    return clubData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchMultipleCommunitiesData = async (query) => {
  try {
    if (
      !Array.isArray(query.ids) ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const communityData = await axios.post(
      "http://multiverse-srv:5020/multiverse/api/v1/community/fetchMultipleCommunitiesFromIds",
      query,
      config
    );
    return communityData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchRelevantResources = async (query) => {
  try {
    if (!query) {
      return;
    }
    const config = generateServiceToken();
    const resources = await axios.get(
      `http://resource-srv:5040/resource/api/v1/searchFromAllResources?query=${query}`,
      config
    );
    return resources.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchRelevantEvents = async (query) => {
  try {
    if (!query) {
      return;
    }
    const config = generateServiceToken();
    const events = await axios.get(
      `http://event-srv:5060/event/api/v1/searchEvents?q=${query}`,
      config
    );
    return events.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchPastOrFutureEvents = async (query) => {
  try {
    if (!query.mode || !query.size) {
      return;
    }
    const config = generateServiceToken();
    const events = await axios.get(
      `http://event-srv:5060/event/api/v1/getPastOrFutureEvents?mode=${query.mode}&size=${query.size}`,
      config
    );
    return events.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchRelevantProfessors = async (regexPatterns) => {
  try {
    const config = generateServiceToken();

    const baseFilter = {
      profession: "Professor",
    };

    if (regexPatterns) {
      const patterns = regexPatterns.split(",");
      baseFilter.$or = [
        { course: { $in: patterns } },
        { field: { $in: patterns } },
      ];
    }

    const body = {
      filter: baseFilter,
      projection: {
        name: 1,
        image: 1,
        pushToken: 1,
        course: 1,
      },
    };

    const professors = await axios.post(
      `http://multiverse-srv:5020/multiverse/api/v1/user/getUsersWithDynamicQuery`,
      body,
      config
    );

    return professors.data.data;
  } catch (error) {
    console.log("Error fetching professors:", error);
  }
};

const fetchRelevantClubs = async (regexPatterns) => {
  try {
    if (!regexPatterns) return;

    const config = generateServiceToken();
    const body = {
      regexPatterns: regexPatterns.split(","),
    };

    const clubs = await axios.post(
      `http://multiverse-srv:5020/multiverse/api/v1/club/searchClubsWithRegex`,
      body,
      config
    );

    return clubs.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchRelevantCommunities = async (regexPatterns) => {
  try {
    if (!regexPatterns) return;

    const config = generateServiceToken();
    const body = {
      regexPatterns: regexPatterns.split(","),
    };

    const communities = await axios.post(
      `http://multiverse-srv:5020/multiverse/api/v1/community/searchCommunitiesWithRegex`,
      body,
      config
    );

    return communities.data.data;
  } catch (error) {
    console.log(error);
  }
};

//function to get related tags
const fetchRelatedTags = async (tag) => {
  try {
    const config = generateServiceToken();
    const tags = await axios.get(
      `http://bag-srv:5050/bag/api/v1/masterSearch?tag=${tag}`,
      config
    );
    return tags.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchClubsRecommendations = async (query) => {
  try {
    if (!query.nIds) {
      return;
    }
    const config = generateServiceToken();
    const clubData = await axios.post(
      "http://multiverse-srv:5020/multiverse/api/v1/club/getClubsRecommendation",
      query,
      config
    );
    return clubData.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchCommunitiesRecommendations = async (query) => {
  try {
    if (!query.nIds) {
      return;
    }
    const config = generateServiceToken();
    const communityData = await axios.post(
      "http://multiverse-srv:5020/multiverse/api/v1/community/getCommunitiesRecommendation",
      query,
      config
    );
    return communityData.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchSampleResources = async () => {
  try {
    const config = generateServiceToken();
    const resources = await axios.get(
      `http://resource-srv:5040/resource/api/v1/getSampleResources`,
      config
    );
    return resources.data;
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  lemmatize,
  fetchUserData,
  fetchNativeUserData,
  fetchMultipleClubsData,
  fetchMultipleCommunitiesData,
  fetchRelatedTags,
  fetchRelevantResources,
  fetchRelevantProfessors,
  fetchRelevantClubs,
  fetchRelevantCommunities,
  fetchRelevantEvents,
  fetchClubsRecommendations,
  fetchCommunitiesRecommendations,
  fetchSampleResources,
  fetchPastOrFutureEvents,
};
