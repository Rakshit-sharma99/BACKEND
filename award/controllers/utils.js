const Mailgen = require("mailgen");
const AWS = require("aws-sdk");
const { getMessaging } = require("firebase-admin/messaging");
const schedule = require("node-schedule");

const sendMail = async (
  name,
  intro,
  outro,
  subject,
  destination,
  action,
  emailHTML,
) => {
  console.log("Mail generating", {
    name,
    intro,
    outro,
    subject,
    destination,
    action,
    emailHTML,
  });
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
  sendMail,
  scheduleNotification2,
};
