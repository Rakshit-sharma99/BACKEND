const jwt = require("jsonwebtoken");
const axios = require("axios");

const services = {
  universe: "universe:5050",
};

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "resource",
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
      "http://multiverse:5020/multiverse/api/v1/user/getUserFieldsById",
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

module.exports = {
  fetchUserData,
  fetchNativeUserData,
  getUserMetaMap,
  scheduleNotification2,
};
