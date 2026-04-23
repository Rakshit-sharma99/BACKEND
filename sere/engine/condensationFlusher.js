/**
 * Condensation Flusher — periodic summary delivery.
 *
 * Runs every 30 seconds and scans Redis for cooldown periods
 * that have expired but have pending accumulated counts.
 * When found, delivers a condensed summary notification
 * (e.g. "10 new posts in Photography Club").
 *
 * This is necessary because condensation summaries are only
 * triggered on "next notification arrival" — if no new
 * notification arrives after cooldown expires, the summary
 * would never be sent. This flusher catches those cases.
 */

const { getRedis } = require("../config/redis");
const {
  flushCondensedSummary,
} = require("../services/condensationManager");
const { isUserOnline } = require("../services/presenceManager");
const { randomUUID } = require("crypto");
const LiveNotificationLog = require("../models/liveNotificationLog");

const COUNT_PREFIX = "sere:cooldown_count:";
const COOLDOWN_PREFIX = "sere:cooldown:";
const FLUSH_INTERVAL_MS = 30000; // 30 seconds

let io = null;
let intervalHandle = null;

/**
 * Start the periodic condensation flusher.
 *
 * @param {import("socket.io").Server} socketIO
 */
function startCondensationFlusher(socketIO) {
  io = socketIO;

  intervalHandle = setInterval(async () => {
    try {
      await flushAllPendingSummaries();
    } catch (error) {
      console.error("❌ SERE condensation flusher error:", error.message);
    }
  }, FLUSH_INTERVAL_MS);

  console.log(
    `🔄 SERE: condensation flusher started (every ${FLUSH_INTERVAL_MS / 1000}s)`,
  );
}

/**
 * Scan Redis for any pending condensation counts
 * whose cooldown has expired, and deliver summaries.
 */
async function flushAllPendingSummaries() {
  const redis = getRedis();

  // Find all count keys
  const countKeys = await redis.keys(`${COUNT_PREFIX}*`);

  for (const countKey of countKeys) {
    try {
      // Extract userId and groupKey from the key
      // Format: sere:cooldown_count:{userId}:{groupKey}
      const suffix = countKey.replace(COUNT_PREFIX, "");
      const separatorIndex = suffix.indexOf(":");
      if (separatorIndex === -1) continue;

      const userId = suffix.substring(0, separatorIndex);
      const groupKey = suffix.substring(separatorIndex + 1);

      // Check if cooldown is still active
      const cooldownKey = `${COOLDOWN_PREFIX}${userId}:${groupKey}`;
      const isInCooldown = await redis.exists(cooldownKey);

      // Only flush if cooldown has expired
      if (isInCooldown) continue;

      // Check if user is still online
      const online = await isUserOnline(userId);
      if (!online) {
        // Clean up — user went offline, discard the summary
        await redis.del(countKey);
        const metaKey = countKey.replace(COUNT_PREFIX, "sere:cooldown_meta:");
        await redis.del(metaKey);
        continue;
      }

      // Flush the summary
      const summary = await flushCondensedSummary(userId, groupKey);
      if (summary && io) {
        const notificationId = randomUUID();
        const payload = {
          id: notificationId,
          ...summary,
          receivedAt: Date.now(),
        };

        io.to(`user:${userId}`).emit("live:notification", payload);

        console.log(
          `📦 SERE flusher: delivered condensed summary to ${userId} (${summary.metadata.condensedCount} items)`,
        );

        // Log for analytics
        LiveNotificationLog.create({
          notificationId,
          targetUserId: userId,
          type: summary.type,
          status: "delivered",
          groupKey,
          deliveredAt: new Date(),
          ttl: summary.ttl,
          metadata: summary.metadata,
        }).catch((err) => {
          console.error("❌ SERE flusher log error:", err.message);
        });
      }
    } catch (err) {
      console.error(
        `❌ SERE flusher: error processing ${countKey}:`,
        err.message,
      );
    }
  }
}

function stopCondensationFlusher() {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    console.log("🔄 SERE: condensation flusher stopped");
  }
}

module.exports = { startCondensationFlusher, stopCondensationFlusher };
