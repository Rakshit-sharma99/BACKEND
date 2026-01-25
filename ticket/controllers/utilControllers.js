const jwt = require("jsonwebtoken");
const axios = require("axios");
const AWS = require("aws-sdk");
const { getMessaging } = require("firebase-admin/messaging");

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
      "http://universe:5050/universe/api/v1/user/getUserFieldsById",
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

const sendMail = async (
  name,
  intro,
  outro,
  subject,
  destination,
  action,
  emailHTML
) => {
  const mailGenerator = new Mailgen({
    theme: "cerberus",
    product: {
      name: "Macbease Team",
      link: "https://macbease.com/",
      logo: "https://mailgen.js/img/logo.png",
    },
  });

  const email = {
    body: {
      name: name,
      intro: intro,
      action: action
        ? {
          instructions:
            action.instructions || "Click the button below to proceed:",
          button: {
            color: action.color || "#1ea1ed",
            text: action.text || "View Details",
            link: action.url,
          },
        }
        : undefined,
      outro: outro,
    },
  };

  if (!Array.isArray(destination)) {
    destination = [destination];
  }

  const emailBody = emailHTML ? emailHTML : mailGenerator.generate(email);

  const params = {
    Source: '"Macbease" <support@macbease.com>',
    Destination: {
      ToAddresses: ["support@macbease.com"],
      BccAddresses: destination,
    },
    Message: {
      Subject: {
        Data: subject,
      },
      Body: {
        Html: {
          Data: emailBody,
        },
      },
    },
  };

  AWS.config.update({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  const ses = new AWS.SES();
  return { ses, params };
};

const scheduleNotification2 = ({ pushToken, title, body, image, url }) => {
  if (!title || !body || !pushToken) {
    console.log("Title,body or push token missing!");
    return;
  }
  let threeSec = new Date(Date.now() + 1 * 3 * 1000);
  schedule.scheduleJob(`notification_${pushToken}`, threeSec, () => {
    pushToken.forEach((token) => {
      if (
        typeof token !== "string" ||
        token.length <= 80 ||
        token === "undefined"
      ) {
        return;
      }

      const message = {
        notification: {
          title: title,
          body: body,
        },
        android: {
          notification: {
            imageUrl: image,
          },
        },
        apns: {
          payload: {
            aps: {
              alert: {
                title: title,
                body: body,
              },
              sound: "default",
              "mutable-content": 1,
            },
          },
          fcm_options: {
            image: image,
          },
        },
        data: {
          url: url,
        },
        token: token,
      };
      getMessaging()
        .send(message)
        .then((response) => {
          console.log("Successfully sent message:", response);
        })
        .catch((error) => {
          console.log("Error sending message:", error);
        });
    });
  });
};

module.exports = {
  fetchEventData,
  fetchUserData,
  fetchNativeClubData,
  scheduleNotification,
  getUserMetaMap,
  fetchItineraries,
  fetchItinerary,
  sendMail,
  scheduleNotification2
};
