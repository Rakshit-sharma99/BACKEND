// ticketQueue.js
const { Queue } = require("bullmq");
require("dotenv").config(); // ← Make sure this is present!

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || undefined,
};

const ticketQueue = new Queue("ticketQueue", { connection });
module.exports = ticketQueue;
