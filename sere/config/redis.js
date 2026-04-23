/**
 * Redis client singleton for SERE.
 *
 * Uses the shared Redis instance on the Docker network.
 * All keys are prefixed with "sere:" to avoid collisions
 * with other services sharing the same Redis.
 */

const Redis = require("ioredis");

let redis = null;

async function connectRedis() {
  const host = process.env.REDIS_HOST || "redis";
  const port = parseInt(process.env.REDIS_PORT) || 6379;

  redis = new Redis({
    host,
    port,
    retryStrategy(times) {
      const delay = Math.min(times * 500, 5000);
      console.log(`🔄 SERE Redis: reconnecting in ${delay}ms (attempt ${times})`);
      return delay;
    },
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  });

  redis.on("connect", () => console.log("✅ SERE: Redis connected"));
  redis.on("error", (err) => console.error("❌ SERE Redis error:", err.message));

  await redis.connect();
  return redis;
}

function getRedis() {
  if (!redis) {
    throw new Error("SERE Redis not initialized. Call connectRedis() first.");
  }
  return redis;
}

module.exports = { connectRedis, getRedis };
