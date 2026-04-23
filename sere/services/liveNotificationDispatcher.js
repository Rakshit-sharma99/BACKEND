/**
 * Live Notification Dispatcher — core delivery logic.
 *
 * Receives a validated notification, checks presence,
 * runs condensation logic, and emits via Socket.IO.
 *
 * This module is the single point of delivery for all
 * live notifications — both direct Kafka events and
 * condensation summaries.
 */

const { randomUUID } = require("crypto");
const { isUserOnline } = require("./presenceManager");
const {
  processCondensation,
  flushCondensedSummary,
  getPendingGroupKeys,
} = require("./condensationManager");
const LiveNotificationLog = require("../models/liveNotificationLog");

// io is set lazily after Socket.IO initializes
let io = null;

function setIO(socketIOServer) {
  io = socketIOServer;
}

/**
 * Dispatch a live notification to a user.
 *
 * @param {string} targetUserId — recipient
 * @param {object} notification — validated & defaulted notification payload
 * @returns {boolean} — true if delivered, false if user offline or suppressed
 */
async function dispatch(targetUserId, notification) {
  if (!io) {
    console.error("❌ SERE Dispatcher: Socket.IO not initialized");
    return false;
  }

  // 1. Check presence
  const online = await isUserOnline(targetUserId);
  if (!online) {
    console.log(`⏸️ SERE: user ${targetUserId} offline, dropping live notification`);
    return false;
  }

  // 2. Run condensation logic
  const { action } = await processCondensation(targetUserId, notification);

  if (action === "suppress") {
    console.log(
      `🔇 SERE: suppressed notification for ${targetUserId} (cooldown active for ${notification.groupKey})`,
    );

    // Log the suppression
    logNotification(targetUserId, notification, "suppressed");
    return false;
  }

  // 3. Deliver the notification
  const notificationId = randomUUID();

  const payload = {
    id: notificationId,
    ...notification,
    receivedAt: Date.now(),
  };

  io.to(`user:${targetUserId}`).emit("live:notification", payload);

  console.log(
    `📡 SERE: delivered live notification [${notification.type}] to ${targetUserId}`,
  );

  // 4. Log delivery
  logNotification(targetUserId, notification, "delivered", notificationId);

  // 5. Check if any condensation summaries are due for this user
  //    (triggered by the arrival of a new notification)
  await flushPendingSummaries(targetUserId);

  return true;
}

/**
 * Check and deliver any pending condensation summaries for a user.
 * This is called after each notification delivery to check if
 * any cooldown periods have expired.
 */
async function flushPendingSummaries(targetUserId) {
  try {
    const groupKeys = await getPendingGroupKeys(targetUserId);

    for (const groupKey of groupKeys) {
      const summary = await flushCondensedSummary(targetUserId, groupKey);
      if (summary) {
        // Check user is still online before sending summary
        const stillOnline = await isUserOnline(targetUserId);
        if (!stillOnline) continue;

        const notificationId = randomUUID();
        const payload = {
          id: notificationId,
          ...summary,
          receivedAt: Date.now(),
        };

        io.to(`user:${targetUserId}`).emit("live:notification", payload);

        console.log(
          `📦 SERE: delivered condensed summary to ${targetUserId} (${summary.metadata.condensedCount} items for ${groupKey})`,
        );

        logNotification(targetUserId, summary, "delivered", notificationId);
      }
    }
  } catch (error) {
    console.error(
      `❌ SERE: error flushing summaries for ${targetUserId}:`,
      error.message,
    );
  }
}

/**
 * Log a notification event for analytics.
 * Fire-and-forget — errors here don't affect delivery.
 */
function logNotification(targetUserId, notification, status, notificationId) {
  LiveNotificationLog.create({
    notificationId: notificationId || "suppressed",
    targetUserId,
    type: notification.type,
    status,
    groupKey: notification.groupKey,
    deliveredAt: status === "delivered" ? new Date() : undefined,
    ttl: notification.ttl,
    metadata: notification.metadata,
  }).catch((err) => {
    console.error("❌ SERE: log write failed:", err.message);
  });
}

module.exports = {
  dispatch,
  flushPendingSummaries,
  setIO,
};
