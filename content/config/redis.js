const Redis = require("ioredis");

const redis = new Redis({
    host: process.env.REDIS_HOST || "redis",
    port: 6379,
    maxRetriesPerRequest: null,
});

redis.on("connect", () => {
    console.log("Connected to Redis");
});

redis.on("error", (err) => {
    console.error("Redis error:", err);
});

module.exports = redis;
