/**
 * Presence Manager — Redis-backed online presence tracking.
 *
 * Each online user has a Redis key: sere:presence:{userId}
 * The value is a Redis SET of active socketIds.
 * TTL is refreshed on every heartbeat (default 5 minutes).
 *
 * Supports multiple devices/sessions per user — the user is
 * considered "online" as long as at least one socket is registered.
 */

const { getRedis } = require("../config/redis");

const PREFIX = "sere:presence:";
const PRESENCE_TTL = 300; // 5 minutes in seconds

/**
 * Register a socket for a user (called on connection).
 */
async function registerSocket(userId, socketId) {
  const redis = getRedis();
  const key = `${PREFIX}${userId}`;

  await redis.sadd(key, socketId);
  await redis.expire(key, PRESENCE_TTL);

  console.log(`🟢 Presence: registered socket ${socketId} for user ${userId}`);
}

/**
 * Unregister a socket for a user (called on disconnect).
 * Removes the key entirely if the set is empty.
 */
async function unregisterSocket(userId, socketId) {
  const redis = getRedis();
  const key = `${PREFIX}${userId}`;

  await redis.srem(key, socketId);

  // If no sockets left, clean up the key
  const remaining = await redis.scard(key);
  if (remaining === 0) {
    await redis.del(key);
    console.log(`🔴 Presence: user ${userId} is now offline`);
  } else {
    console.log(
      `🟡 Presence: removed socket ${socketId} for user ${userId} (${remaining} remaining)`,
    );
  }
}

/**
 * Refresh presence TTL (called on heartbeat).
 */
async function refreshPresence(userId) {
  const redis = getRedis();
  const key = `${PREFIX}${userId}`;

  const exists = await redis.exists(key);
  if (exists) {
    await redis.expire(key, PRESENCE_TTL);
  }
}

/**
 * Check if a user is currently online.
 */
async function isUserOnline(userId) {
  const redis = getRedis();
  const key = `${PREFIX}${userId}`;

  const count = await redis.scard(key);
  return count > 0;
}

/**
 * Get all active socket IDs for a user.
 */
async function getUserSockets(userId) {
  const redis = getRedis();
  const key = `${PREFIX}${userId}`;

  return redis.smembers(key);
}

module.exports = {
  registerSocket,
  unregisterSocket,
  refreshPresence,
  isUserOnline,
  getUserSockets,
};
