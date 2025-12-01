const User = require("../../../models/user");
const mongoose = require("mongoose");
const schedule = require("node-schedule");
const {
  sendMail,
  scheduleNotification2,
} = require("../../../controllers/utils");

// Helper to schedule email and push notification
const scheduleTicketNotification = (
  ticketId,
  eventName,
  eventManagerMail,
  userName,
  userEmail,
  userPushToken
) => {
  const notifyJobTime = new Date(Date.now() + 5 * 1000); // 5 seconds later
  const jobName = `notifyTicketPurchase_${ticketId}_${Date.now()}`;

  schedule.scheduleJob(jobName, notifyJobTime, async () => {
    await sendTicketPurchaseEmail(
      eventName,
      eventManagerMail,
      userName,
      userEmail
    );
    await sendTicketPurchaseNotifications(userPushToken, eventName);
  });
};

// Email Notification
const sendTicketPurchaseEmail = async (
  eventName,
  eventManagerMail,
  userName,
  userEmail
) => {
  const intro = [
    `Thank you for purchasing the ticket for "${eventName}".`,
    "You can view your ticket anytime from your Macbease account.",
  ];
  const outro = `For any queries, reach out at ${eventManagerMail} or post on the event FAQ console.`;

  const { ses, params } = await sendMail(
    userName,
    intro,
    outro,
    "Macbease Ticket Confirmation",
    [userEmail],
    {
      instructions: "Click below to view your ticket:",
      text: "View Ticket",
      url: `https://macbease.com/app/yourTickets`,
      color: "#1ea1ed",
    }
  );

  ses.sendEmail(params, (err) => {
    if (err) console.error("❌ SES Email Error:", err.stack);
  });
};

// Push Notification
const sendTicketPurchaseNotifications = async (userPushToken, eventName) => {
  const notificationData = {
    pushToken: [userPushToken],
    title: "Ticket Booked 🎟️",
    body: `You're all set for "${eventName}"!`,
    url: `https://macbease.com/app/yourTickets`,
  };
  scheduleNotification2(notificationData);
};

// Main Kafka-triggered handler
const add_ticket_to_user_schema = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { userId, ticketId, eventData } = data;

    const user = await User.findById(userId, {
      image: 1,
      name: 1,
      email: 1,
      pushToken: 1,
    });

    if (!user) {
      console.warn(`User not found for ticket assignment: ${userId}`);
      return;
    }

    const notice = {
      value: `You have purchased a ticket for "${eventData.eventName}"`,
      img1: user.image,
      img2: eventData.eventPoster,
      key: "event",
      action: "yourTickets",
      params: {},
      time: new Date(),
      uid: `${Date.now()}/${ticketId}/${userId}`,
    };

    await User.findByIdAndUpdate(userId, {
      $push: {
        ticketsBought: {
          $each: [new mongoose.Types.ObjectId(ticketId)],
          $position: 0,
        },
        unreadNotice: {
          $each: [notice],
          $position: 0,
        },
      },
    });

    scheduleTicketNotification(
      ticketId,
      eventData.eventName,
      eventData.eventManagerMail,
      user.name,
      user.email,
      user.pushToken
    );
  } catch (error) {
    console.error("❌ Failed to process ticket assignment:", error);
  }
};

module.exports = { add_ticket_to_user_schema };
