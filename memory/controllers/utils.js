const { getMessaging } = require("firebase-admin/messaging");
const schedule = require("node-schedule");

const generateUri = async (url) => {
  const URLa = "https://d33g7orf12ceoo.cloudfront.net/";
  const bucket = "onlytemptestingmacbease";
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
            ...(image && { imageUrl: image }),
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
          ...(image && { fcm_options: { image: image } }),
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
    generateUri,
    scheduleNotification2
}