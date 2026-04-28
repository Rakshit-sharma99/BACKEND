/**
 * Proactive Dispatcher — Delivers generated proactive messages.
 *
 * Runs on the 5-minute scheduler tick. Finds ProactiveMessages
 * with status="generated" and scheduledFor <= now, then:
 *
 *   1. Creates a new Starman conversation session
 *   2. Inserts the message as role="model"
 *   3. Triggers push notification via universe push endpoint
 *   4. Updates ProactiveMessage status → "dispatched"
 *   5. Updates UserEngagement stats
 *   6. Publishes Kafka event: "starman.proactive_sent"
 */

const axios = require("axios");
const jwt = require("jsonwebtoken");

const ProactiveMessage = require("../models/proactiveMessage");
const UserEngagement = require("../models/userEngagement");

const STARMAN_URL =
  process.env.STARMAN_URL || "http://starman:7060/starman/api/v1";
const UNIVERSE_URL =
  process.env.UNIVERSE_URL || "http://universe:5050/universe/api/v1";

// ── Auth ──

function getInternalToken() {
  return jwt.sign(
    { role: "internal", service: "sere" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
}

function internalHeaders() {
  return { Authorization: `Bearer ${getInternalToken()}` };
}

// ── Core Dispatch Logic ──

/**
 * Find and dispatch all due proactive messages.
 * Called by the scheduler every 5 minutes.
 */
async function dispatchPendingProactiveMessages() {
  const now = new Date();

  const dueMessages = await ProactiveMessage.find({
    status: "generated",
    scheduledFor: { $lte: now },
    expiresAt: { $gt: now }, // not expired
  }).limit(50);

  if (dueMessages.length === 0) return;

  console.log(`🚀 SERE: dispatching ${dueMessages.length} proactive messages...`);

  for (const message of dueMessages) {
    try {
      await dispatchSingleMessage(message);
    } catch (error) {
      console.error(
        `❌ SERE: dispatch failed for proactive message ${message._id}:`,
        error.message,
      );
      // Don't change status — will retry next cycle
    }
  }
}

/**
 * Dispatch a single proactive message.
 */
async function dispatchSingleMessage(message) {
  // 1. Create a new Starman conversation with the proactive message
  let sessionId = null;
  try {
    const starmanRes = await axios.post(
      `${STARMAN_URL}/internal/proactive-message`,
      {
        userId: message.userId.toString(),
        uid: message.uid.toString(),
        messageText: message.messageText,
        proactiveMessageId: message._id.toString(),
        messageType: message.messageType,
      },
      { headers: internalHeaders(), timeout: 5000 },
    );

    sessionId = starmanRes.data?.sessionId;
    if (!sessionId) {
      throw new Error("Starman did not return a sessionId");
    }
  } catch (err) {
    console.error(
      `❌ SERE: Starman proactive message creation failed for ${message._id}:`,
      err.message,
    );
    // Don't update status — retry on next cycle
    return;
  }

  // 2. Trigger push notification
  let pushDelivered = false;
  try {
    const pushRes = await axios.post(
      `${UNIVERSE_URL}/push/send`,
      {
        userId: message.userId.toString(),
        title: "✨ Starman",
        body: message.messageText,
        data: {
          type: "starman_proactive",
          sessionId,
          proactiveMessageId: message._id.toString(),
          messageType: message.messageType,
          navigateTo: "starmanChat",
          params: JSON.stringify({ sessionId }),
        },
      },
      { headers: internalHeaders(), timeout: 5000 },
    );

    pushDelivered = pushRes.data?.success || false;
  } catch (err) {
    console.error(
      `❌ SERE: push notification failed for proactive message ${message._id}:`,
      err.message,
    );
    // Push failure is non-blocking — message is still in Starman conversation
  }

  // 3. Update ProactiveMessage
  message.status = "dispatched";
  message.dispatchedAt = new Date();
  message.sessionId = sessionId;
  message.pushDelivered = pushDelivered;
  message.action.params = { sessionId };
  await message.save();

  // 4. Update UserEngagement
  await UserEngagement.findOneAndUpdate(
    { userId: message.userId },
    {
      $set: { lastProactiveNudgeAt: new Date() },
      $inc: { proactiveNudgesSent: 1 },
    },
  );

  console.log(
    `📤 SERE: dispatched proactive [${message.messageType}] to user ${message.userId} (session: ${sessionId}, push: ${pushDelivered})`,
  );
}

/**
 * Expire proactive messages that have passed their expiry time.
 * Called alongside dispatchPendingProactiveMessages.
 */
async function expireProactiveMessages() {
  const now = new Date();

  const result = await ProactiveMessage.updateMany(
    {
      expiresAt: { $lte: now },
      status: { $in: ["pending", "generated", "dispatched", "delivered"] },
    },
    { $set: { status: "expired" } },
  );

  if (result.modifiedCount > 0) {
    console.log(`🗑️ SERE: expired ${result.modifiedCount} proactive messages`);

    // For expired messages that were dispatched but never opened,
    // increment consecutiveNudgeIgnores
    const expiredDispatched = await ProactiveMessage.find({
      status: "expired",
      dispatchedAt: { $exists: true },
      openedAt: { $exists: false },
      expiresAt: { $lte: now },
      // Only process recently expired (within last hour) to avoid reprocessing
      expiresAt: { $gte: new Date(now - 60 * 60 * 1000) },
    });

    for (const msg of expiredDispatched) {
      await UserEngagement.findOneAndUpdate(
        { userId: msg.userId },
        { $inc: { consecutiveNudgeIgnores: 1 } },
      );
    }
  }
}

module.exports = {
  dispatchPendingProactiveMessages,
  dispatchSingleMessage,
  expireProactiveMessages,
};
