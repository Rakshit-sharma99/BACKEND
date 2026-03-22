/**
 * Kafka configuration for SERE.
 *
 * Consumer: listens to engagement events:
 *   - user.signup, user.activity, streak.update
 *   - query.deferred, answer.resolved
 *   - chat.completed (for activity tracking)
 *
 * Producer: publishes reminder lifecycle events:
 *   - reminder.deliver, reminder.interaction
 */

const { Kafka, logLevel } = require("kafkajs");
const { processEvent } = require("../engine/rules");

const kafka = new Kafka({
  clientId: "sere-service",
  brokers: [process.env.KAFKA_BROKER || "kafka:9092"],
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 3000,
    retries: 10,
  },
});

const producer = kafka.producer();
const consumer = kafka.consumer({ groupId: "sere-engagement-group" });

let producerConnected = false;

// ── Topics to subscribe to ──
const SUBSCRIBED_TOPICS = [
  "user.signup",
  "user.activity",
  "streak.update",
  "query.deferred",
  "answer.resolved",
  "chat.completed",
];

// ── Producer ──

async function connectProducer() {
  console.log("⏳ SERE: connecting Kafka producer...");
  while (true) {
    try {
      await producer.connect();
      producerConnected = true;
      console.log("✅ SERE Kafka Producer connected");
      break;
    } catch (error) {
      console.error(
        "❌ SERE Kafka Producer connection failed. Retrying in 5s...",
        error.message,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

async function publishEvent(topic, data) {
  if (!producerConnected) {
    console.warn(`⚠️ SERE Kafka not connected, skipping publish to ${topic}`);
    return;
  }
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(data) }],
    });
    console.log(`📤 SERE published to ${topic}`);
  } catch (err) {
    console.error(`SERE: failed to publish to ${topic}:`, err.message);
  }
}

// ── Consumer ──

async function startConsumer() {
  console.log("⏳ SERE: connecting Kafka consumer...");
  while (true) {
    try {
      await consumer.connect();
      console.log("✅ SERE Kafka Consumer connected");
      break;
    } catch (error) {
      console.error(
        "❌ SERE Kafka Consumer connection failed. Retrying in 5s...",
        error.message,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }

  // Subscribe to all relevant topics
  for (const topic of SUBSCRIBED_TOPICS) {
    await consumer.subscribe({ topic, fromBeginning: false });
  }

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const data = JSON.parse(message.value.toString());
        console.log(`📥 SERE: received event [${topic}]`, {
          userId: data.userId,
        });

        // Map chat.completed to user.activity for engagement tracking
        const eventType =
          topic === "chat.completed" ? "user.activity" : topic;

        await processEvent(eventType, data);
      } catch (error) {
        console.error(
          `❌ SERE: error processing message from ${topic}:`,
          error.message,
        );
      }
    },
  });

  console.log("🎧 SERE Kafka Consumer is listening...");
}

module.exports = {
  connectProducer,
  startConsumer,
  publishEvent,
};
