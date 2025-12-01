const jwt = require("jsonwebtoken");
const axios = require("axios");
const { getMessaging } = require("firebase-admin/messaging");
const schedule = require("node-schedule");

const services = {
  universe: "universe-srv:5050",
};

const generateServiceToken = () => {
  const token = jwt.sign(
    {
      service: "macbeaseContent",
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

const scheduleNotification = (pushToken, title, body, image) => {
  if (!pushToken) {
    console.log("Title,body or push token missing!");
    return;
  }
  let threeSec = new Date(Date.now() + 1 * 3 * 1000);
  schedule.scheduleJob(`notification_${pushToken}`, threeSec, () => {
    pushToken.forEach((token) => {
      if (token === "undefined" || !token.length > 80) {
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
            image: image, // <-- MUST be nested here, not at root
          },
        },
        data: {
          url: image,
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

module.exports = {fetchNativeUserData,fetchUserData,generateUri,scheduleNotification2,scheduleNotification}