const jwt = require("jsonwebtoken");
const axios = require("axios");
const { getMessaging } = require("firebase-admin/messaging");
const schedule = require("node-schedule");
const nlp = require("compromise");

const services = {
  universe: "universe:5050",
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
      "http://universe:5050/universe/api/v1/user/getUserFieldsById",
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

const fetchNativeRandomClubs = async (query) => {
  try {
    if (!query.size || !query.projection || !query.callSign) {
      return;
    }
    const service = services[query.callSign];
    const config = generateServiceToken();
    if (!service) return;
    const clubData = await axios.post(
      `http://${service}/${query.callSign}/api/v1/club/getRandomClubs?size=${query.size}&projection=${query.projection}`,
      query,
      config
    );
    return clubData.data.data;
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
      "http://universe:5050/universe/api/v1/club/getClubsRecommendation",
      query,
      config
    );
    return clubData.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchCommunityData = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const communityData = await axios.post(
      "http://universe:5050/universe/api/v1/community/getCommunityFieldsById",
      query,
      config
    );
    return communityData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchNativeRandomCommunities = async (query) => {
  try {
    if (!query.size || !query.projection || !query.callSign) {
      return;
    }
    const service = services[query.callSign];
    const config = generateServiceToken();
    if (!service) return;
    const communityData = await axios.post(
      `http://${service}/${query.callSign}/api/v1/community/getRandomCommunities?size=${query.size}&projection=${query.projection}`,
      query,
      config
    );
    return communityData.data.data;
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
      "http://universe:5050/universe/api/v1/community/getCommunitiesRecommendation",
      query,
      config
    );
    return communityData.data;
  } catch (error) {
    console.log(error);
  }
};

const generateUri = async (url) => {
  const URLa = "https://d5e1vvp3vh274.cloudfront.net/";
  const bucket = "s3userdata25136-dev";
  const UriRequest = JSON.stringify({
    bucket,
    key: url,
    edits: {
      resize: {
        width: 500,
        height: 500,
      },
    },
  });
  const encoded = Buffer.from(UriRequest).toString("base64");
  return URLa + encoded;
};

const scheduleNotification2 = ({ pushToken, title, body, image, url }) => {
  if (!title || !body || !pushToken) {
    console.log("Title,body or push token missing!");
    return;
  }
  let threeSec = new Date(Date.now() + 1 * 3 * 1000);
  // schedule.scheduleJob(`notification_${pushToken}`, threeSec, () => {
  //   pushToken.forEach((token) => {
  //     if (
  //       typeof token !== "string" ||
  //       token.length <= 80 ||
  //       token === "undefined"
  //     ) {
  //       return;
  //     }

  //     const message = {
  //       notification: {
  //         title: title,
  //         body: body,
  //       },
  //       android: {
  //         notification: {
  //           imageUrl: image,
  //         },
  //       },
  //       apns: {
  //         payload: {
  //           aps: {
  //             alert: {
  //               title: title,
  //               body: body,
  //             },
  //             sound: "default",
  //             "mutable-content": 1,
  //           },
  //         },
  //         fcm_options: {
  //           image: image,
  //         },
  //       },
  //       data: {
  //         url: url,
  //       },
  //       token: token,
  //     };
  //     getMessaging()
  //       .send(message)
  //       .then((response) => {
  //         console.log("Successfully sent message:", response);
  //       })
  //       .catch((error) => {
  //         console.log("Error sending message:", error);
  //       });
  //   });
  // });
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

//function to get related tags
const fetchRelatedTags = async (tag) => {
  try {
    const config = generateServiceToken();
    const tags = await axios.get(
      `http://bag:5090/bag/api/v1/masterSearch?tag=${tag}`,
      config
    );
    return tags.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchCardsFromIds = async ({ ids, select }) => {
  try {
    const config = generateServiceToken();
    const body = { ids, select };
    const cards = await axios.post(
      `http://card:5030/card/api/v1/getCardsByIds`,
      body,
      config
    );
    return cards.data;
  } catch (error) {
    console.log(error);
    return [];
  }
};

const fetchRandomCardsForFeed = async () => {
  try {
    const config = generateServiceToken();
    const cards = await axios.get(
      `http://card:5030/card/api/v1/getRandomCardsForFeed`,
      config
    );
    return cards.data;
  } catch (error) {
    console.log(error);
    return [];
  }
};

const checkUserBookmarks = async ({ userId, contentIds }) => {
  try {
    const config = generateServiceToken();
    const body = { userId, contentIds };
    const bookmarksResponse = await axios.post(
      `http://universe:5050/universe/api/v1/user/checkBookmarks`,
      body,
      config
    );
    return bookmarksResponse.data.bookmarkedIds || [];
  } catch (error) {
    console.log(error);
    return [];
  }
};

module.exports = {
  generateServiceToken,
  fetchUserData,
  fetchNativeUserData,
  fetchClubData,
  fetchNativeRandomClubs,
  fetchClubsRecommendations,
  fetchCommunityData,
  fetchNativeRandomCommunities,
  fetchCommunitiesRecommendations,
  generateUri,
  scheduleNotification2,
  lemmatize,
  fetchRelatedTags,
  fetchCardsFromIds,
  fetchRandomCardsForFeed,
  checkUserBookmarks,
};
