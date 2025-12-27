const jwt = require("jsonwebtoken");
const axios = require("axios");

const services = {
  universe: "universe:5050",
};

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "ticket",
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
      "http://multiverse:5020/multiverse/api/v1/user/getUserFieldsById",
      query,
      config
    );
    return userData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const fetchNativeClubData = async (query) => {
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
    const clubData = await axios.post(
      `http://${service}/${query.callSign}/api/v1/club/getClubFieldsById`,
      query,
      config
    );
    return clubData.data.data;
  } catch (error) {
    console.log(error);
  }
};

const scheduleNotification = (pushTokens, title, body, image) => {
  if (!Array.isArray(pushTokens) || !title || !body) {
    console.log("Missing title, body, or pushTokens array!");
    return;
  }

  const fireTime = new Date(Date.now() + 3 * 1000); // 3 seconds delay

  // schedule.scheduleJob(`notification_${Date.now()}`, fireTime, () => {
  //   pushTokens.forEach((token) => {
  //     if (!token || token === "undefined" || token.length < 10) {
  //       return;
  //     }

  //     const message = {
  //       notification: {
  //         title,
  //         body,
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
  //               title,
  //               body,
  //             },
  //             sound: "default",
  //             "mutable-content": 1,
  //           },
  //         },
  //         fcm_options: {
  //           image,
  //         },
  //       },
  //       data: {
  //         url: typeof image === "string" ? image : JSON.stringify(image ?? ""),
  //       },
  //       token: token,
  //     };

  //     getMessaging()
  //       .send(message)
  //       .then((response) => {
  //         console.log("✅ Successfully sent message:", response);
  //       })
  //       .catch((error) => {
  //         console.error("❌ Error sending message:", error);
  //       });
  //   });
  // });
};

const getUserMetaMap = async (userIds, fields) => {
  try {
    if (!Array.isArray(userIds) || !Array.isArray(fields)) {
      return;
    }
    const config = generateServiceToken();
    const { data } = await axios.post(
      "http://multiverse:5020/multiverse/api/v1/user/fetchBulkUsers",
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

const fetchItineraries = async (query) => {
  try {
    if (!Array.isArray(query.itineraryIds) || query.itineraryIds.length === 0) {
      return [];
    }
    const config = generateServiceToken();
    const itineraryData = await axios.post(
      `http://itinerary:6050/itinerary/api/v1/getItinerariesByIds`,
      query,
      config
    );
    return itineraryData.data.itineraries;
  } catch (error) {
    console.log(error);
  }
};

const fetchItinerary = async (query) => {
  try {
    if (
      !query.id ||
      !Array.isArray(query.fields) ||
      query.fields.length === 0
    ) {
      return;
    }
    const config = generateServiceToken();
    const itineraryData = await axios.post(
      `http://itinerary:6050/itinerary/api/v1/getItineraryFieldsById`,
      query,
      config
    );
    return itineraryData.data.data;
  } catch (error) {
    console.log(error);
  }
};

module.exports = {
  fetchEventData,
  fetchUserData,
  fetchNativeClubData,
  scheduleNotification,
  getUserMetaMap,
  fetchItineraries,
  fetchItinerary
};
