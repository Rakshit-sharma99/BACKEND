// workers/ticketWorker.js
const { Worker } = require("bullmq");
require("dotenv").config(); // ← Make sure this is present!
const mongoose = require("mongoose");
const createTicketForEvent = require("../jobs/ticket");
const {
  scheduleTicketNotification,
} = require("../jobs/ticket/helper");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const { fetchEventData, fetchUserData } = require("../controllers/utilControllers");

const connection = {
  host: process.env.REDIS_HOST || "redis",
  port: 6379,
  password: process.env.REDIS_PASSWORD || undefined,
};

new Worker(
  "ticketQueue",
  async (job) => {
    const { payment } = job.data;
    const notes = payment.notes || {};
    const { userId, eventId } = notes;

    const session = await mongoose.startSession();

    let ticket = null;

    try {
      // -----------------------
      // TRANSACTION SCOPE (RETRY SAFE)
      // -----------------------
      await session.withTransaction(async () => {
        ticket = await createTicketForEvent({ payment, session });
      });
    } catch (err) {
      // No need to manually abort — withTransaction already did
      throw err; // will trigger BullMQ retry
    } finally {
      session.endSession(); // Only once
    }

    // ---------------------------------
    // OUTSIDE TRANSACTION — NO RETRIES
    // ---------------------------------
    if (!ticket) {
      console.log("Duplicate payment. No secondary actions.");
      return;
    }

    // Fetch event & user
    const [eventData, userData] = await Promise.all([
      fetchEventData({ id: eventId, fields: ['_id', 'name', 'eventManagerMail', 'url', 'authorizedPerson', 'belongsTo'] }),
      fetchUserData({ id: userId, fields: ['_id', 'name', 'field', 'email', 'image', 'pushToken'] })
    ]);

    // A) Stats update
    try {
      await sendKafkaMessage("UPDATE_EVENT_STATS", "event", {
        eventId,
        amtPaid: notes.amtPaid,
        userField: userData.userField,
      });
    } catch (err) {
      console.error("Stats update failed (non-fatal):", err);
    }

    // B) Notifications
    try {
      scheduleTicketNotification(ticket, eventData, userData);
    } catch (err) {
      console.error("Notification scheduling failed (non-fatal):", err);
    }

    // C) WhatsApp (if you want)
    // try { sendWhatsAppMessage(...); } catch(e) { console.error(...) }
  },
  {
    connection,
    concurrency: Number(process.env.WORKER_CONCURRENCY || 3),
  }
);
