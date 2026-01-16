// workers/ticketWorker.js
const { Worker } = require("bullmq");
require("dotenv").config(); // ← Make sure this is present!
const mongoose = require("mongoose");
const Event = require("../models/event");
const User = require("../models/user");
const createTicketForEvent = require("../jobs/ticket");
const {
  updateEventStatsJob,
  scheduleTicketNotification,
} = require("../jobs/ticket/helper");

const connection = {
  host: process.env.REDIS_HOST || "redis",
  port: Number(process.env.REDIS_PORT || 6379),
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
      Event.findById(eventId, {
        name: 1,
        eventManagerMail: 1,
        url: 1,
        authorizedPerson: 1,
        belongsTo: 1,
      }),
      User.findById(userId, {
        name: 1,
        field: 1,
        email: 1,
        image: 1,
        pushToken: 1,
      }),
    ]);

    // A) Stats update
    try {
      await updateEventStatsJob({ eventId, amtPaid: notes.amtPaid });
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
