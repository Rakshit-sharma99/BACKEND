/**
 * Condensation Manager — Entity-based notification batching.
 *
 * When many notifications arrive for the same entity (e.g. a club
 * getting lots of posts), we deliver the first one immediately,
 * then enter a cooldown period (default 3 minutes). During cooldown,
 * we accumulate a count. When the cooldown expires, we deliver a
 * single summary notification (e.g. "10 new posts in Photography Club").
 *
 * Redis keys:
 *   sere:cooldown:{userId}:{groupKey} → "active"     (TTL = COOLDOWN_MS / 1000)
 *   sere:cooldown_count:{userId}:{groupKey} → number  (TTL = COOLDOWN_MS / 1000 + buffer)
 *   sere:cooldown_meta:{userId}:{groupKey} → JSON     (stores entity name, type, action for summary)
 */

const { getRedis } = require("../config/redis");

const COOLDOWN_PREFIX = "sere:cooldown:";
const COUNT_PREFIX = "sere:cooldown_count:";
const META_PREFIX = "sere:cooldown_meta:";
const COOLDOWN_SECONDS = 180; // 3 minutes
const COUNT_TTL_BUFFER = 30; // extra seconds to keep count after cooldown

/**
 * Determine if a notification should be delivered immediately,
 * suppressed (accumulated), or if a summary should be sent.
 *
 * @param {string} userId       — target user
 * @param {object} notification — the full notification payload
 * @returns {{ action: "deliver" | "suppress", summary?: object }}
 *
 * Flow:
 * 1. If no groupKey on the notification → always deliver (no condensation)
 * 2. If no active cooldown → deliver immediately, start cooldown
 * 3. If active cooldown → increment count, suppress this notification
 */
async function processCondensation(userId, notification) {
  const { groupKey } = notification;

  // No groupKey means no condensation — always deliver
  if (!groupKey) {
    return { action: "deliver" };
  }

  const redis = getRedis();
  const cooldownKey = `${COOLDOWN_PREFIX}${userId}:${groupKey}`;
  const countKey = `${COUNT_PREFIX}${userId}:${groupKey}`;
  const metaKey = `${META_PREFIX}${userId}:${groupKey}`;

  const isInCooldown = await redis.exists(cooldownKey);

  if (!isInCooldown) {
    // No active cooldown — deliver this notification and start cooldown
    await redis.set(cooldownKey, "active", "EX", COOLDOWN_SECONDS);
    await redis.set(countKey, "0", "EX", COOLDOWN_SECONDS + COUNT_TTL_BUFFER);

    // Store metadata for summary generation
    const meta = {
      type: notification.type,
      entityName: notification.metadata?.entityName || notification.title,
      action: notification.action,
      image: notification.image,
    };
    await redis.set(
      metaKey,
      JSON.stringify(meta),
      "EX",
      COOLDOWN_SECONDS + COUNT_TTL_BUFFER,
    );

    return { action: "deliver" };
  }

  // In cooldown — suppress and increment count
  await redis.incr(countKey);

  return { action: "suppress" };
}

/**
 * Check if any cooldown has expired and a summary is due.
 * Called periodically or via Redis keyspace notification.
 *
 * For a simpler approach, we use a "flush on next notification" pattern:
 * when the cooldown key has expired but the count key still exists,
 * we know a summary is due.
 *
 * @param {string} userId
 * @param {string} groupKey
 * @returns {object|null} — summary notification to deliver, or null
 */
async function flushCondensedSummary(userId, groupKey) {
  const redis = getRedis();
  const cooldownKey = `${COOLDOWN_PREFIX}${userId}:${groupKey}`;
  const countKey = `${COUNT_PREFIX}${userId}:${groupKey}`;
  const metaKey = `${META_PREFIX}${userId}:${groupKey}`;

  // If cooldown is still active, nothing to flush
  const isInCooldown = await redis.exists(cooldownKey);
  if (isInCooldown) return null;

  // Check if there's a pending count
  const countStr = await redis.get(countKey);
  if (!countStr) return null;

  const count = parseInt(countStr, 10);
  if (count <= 0) {
    // Clean up — no suppressed notifications
    await redis.del(countKey, metaKey);
    return null;
  }

  // Get stored metadata
  const metaStr = await redis.get(metaKey);
  const meta = metaStr ? JSON.parse(metaStr) : {};

  // Clean up
  await redis.del(countKey, metaKey);

  // Build summary notification
  return {
    type: meta.type || "system",
    title: meta.entityName || "Activity Update",
    body: buildSummaryBody(count, meta),
    image: meta.image,
    action: meta.action,
    ttl: 10000,
    priority: "normal",
    metadata: {
      isSummary: true,
      condensedCount: count,
      groupKey,
      entityName: meta.entityName,
    },
  };
}

/**
 * Build a human-readable summary body.
 */
function buildSummaryBody(count, meta) {
  const entityName = meta.entityName || "this channel";
  const type = meta.type || "";

  switch (type) {
    case "club_post":
    case "community_announcement":
      return `${count} new post${count > 1 ? "s" : ""} in ${entityName}`;
    case "dm":
      return `${count} new message${count > 1 ? "s" : ""} from ${entityName}`;
    case "share":
      return `${count} new shared item${count > 1 ? "s" : ""} from ${entityName}`;
    case "reaction":
      return `${count} new reaction${count > 1 ? "s" : ""} on your post`;
    default:
      return `${count} new update${count > 1 ? "s" : ""} from ${entityName}`;
  }
}

/**
 * Get all pending cooldown group keys for a user.
 * Used by the periodic flusher to check if summaries are due.
 */
async function getPendingGroupKeys(userId) {
  const redis = getRedis();
  const pattern = `${COUNT_PREFIX}${userId}:*`;

  const keys = await redis.keys(pattern);
  return keys.map((key) => key.replace(`${COUNT_PREFIX}${userId}:`, ""));
}

module.exports = {
  processCondensation,
  flushCondensedSummary,
  getPendingGroupKeys,
  COOLDOWN_SECONDS,
};
