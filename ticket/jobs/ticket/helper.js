const schedule = require("node-schedule");
const { scheduleNotification2, sendMail } = require("../../controllers/utilControllers");

//ticket generate secondary actions
const scheduleTicketNotification = (ticket, event, user) => {
  const notifyJobTime = new Date(Date.now() + 5 * 1000);
  const jobName = `notifyTicketPurchase_${ticket._id}_${Date.now()}`;
  if (user && event) {
    schedule.scheduleJob(jobName, notifyJobTime, async () => {
      await sendTicketPurchaseEmail(user, event);
      await sendTicketPurchaseNotifications(user, event);
    });
  }
};

const sendTicketPurchaseEmail = async (user, event) => {
  const intro = [
    `Thank you for purchasing the ticket for the event ${event?.name}. Your ticket is available on your Macbease account.`,
    "We will see you there.",
  ];
  const outro = `For any queries please mail on ${event?.eventManagerMail} or post a query on the event FAQ console.`;

  const { ses, params } = await sendMail(
    user.name,
    intro,
    outro,
    "Macbease Ticket",
    [user.email],
    {
      instructions: "Click below to view your ticket:",
      text: "View Ticket",
      url: `https://macbease.com/app/yourTickets`,
      color: "#1ea1ed",
    }
  );
  ses.sendEmail(params, (err, data) => {
    if (err) console.log(err, err.stack);
  });
};

const sendTicketPurchaseNotifications = async (user, event) => {
  const notificationData = {
    pushToken: [user.pushToken],
    title: "Ticket successfully purchased!",
    body: `Ticket for ${event.name} has been added to your account.`,
    url: `https://macbease.com/app/yourTickets`,
  };
  scheduleNotification2(notificationData);

  if (event?.authorizedPerson?.pushToken) {
    scheduleNotification2({
      pushToken: [event.authorizedPerson.pushToken],
      title: "Congratulations! Ticket sold.",
      body: `To see live statistics please visit your ${event.name} event console.`,
      url: `https://macbease.com/app/club/${event.belongsTo}`,
    });
  }
};

const sendWhatsAppBounceMessage = async (number, amt) => {
  try {
    // Environment variables (make sure you add them in your .env file)
    const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
    const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

    const url = `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to: number,
      type: "template",
      template: {
        name: "ticket_processing_update",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "there!" },
              { type: "text", text: amt },
              { type: "text", text: "Macbease Event" },
            ],
          },
        ],
      },
    };

    const headers = {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    };

    await axios.post(url, payload, { headers, timeout: 5000 });
  } catch (error) {
    console.error(
      "Error sending WhatsApp message:",
      error?.response?.data || error.message
    );
  }
};

module.exports = { scheduleTicketNotification };
