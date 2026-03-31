const { Kafka, logLevel } = require("kafkajs");
const { updateInsight } = require("../controllers/answerController");
const ExternalContext = require("../models/externalContext");
const { distillMessages } = require("../controllers/distillationHelper");

const kafka = new Kafka({
  clientId: "knowledge-service",
  brokers: [process.env.KAFKA_BROKER || "kafka:9092"],
  logLevel: logLevel.INFO,
  retry: {
    initialRetryTime: 3000,
    retries: 10,
  },
});

const consumer = kafka.consumer({ groupId: "knowledge-group" });

const connectConsumer = async () => {
  console.log("⏳ Knowledge Service: Attempting to connect to Kafka...");

  while (true) {
    try {
      await consumer.connect();
      console.log("✅ Kafka Consumer connected (knowledge-service)");

      await consumer.subscribe({ topic: "answer.submitted" });
      await consumer.subscribe({ topic: "network.message.new" });

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const eventData = JSON.parse(message.value.toString());

          if (topic === "answer.submitted") {
            console.log(`📩 Received event on ${topic}:`, {
              questionId: eventData.questionId,
              userId: eventData.userId,
            });
            await updateInsight(
              eventData.questionId,
              eventData.uid,
              eventData.universeMetaData
            );
          }

          if (topic === "network.message.new") {
            console.log(
              `📨 Received network message event: ${eventData.messages?.length || 0} messages for entity ${eventData.entityId}`
            );
            await handleNetworkMessage(eventData);
          }
        },
      });

      break;
    } catch (error) {
      console.error(
        "❌ Kafka Consumer connection failed (knowledge-service). Retrying in 5s...",
        error
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

/**
 * Handle incoming network messages from social-claw.
 * Appends to hot context and triggers distillation when threshold is reached.
 */
async function handleNetworkMessage(eventData) {
  const { uid, entityId, userId, messages } = eventData;
  if (!uid || !entityId || !messages || messages.length === 0) return;

  try {
    const entity = await ExternalContext.findOne({ uid, entityId });
    if (!entity || entity.status !== "synced") return;

    // Append to hot context
    const newEntries = messages
      .filter((m) => m.text && m.text.trim().length > 0)
      .map((m) => ({
        text: m.text,
        sender: m.sender || "Unknown",
        timestamp: m.timestamp,
        category: "general",
        contributorId: userId || null,
      }));

    entity.hotContext.entries.push(...newEntries);

    // Enforce cap
    const maxEntries = entity.hotContext.maxEntries || 500;
    if (entity.hotContext.entries.length > maxEntries) {
      entity.hotContext.entries = entity.hotContext.entries.slice(-maxEntries);
    }

    // Update cursor
    const newestTimestamp = Math.max(...messages.map((m) => m.timestamp || 0));
    if (newestTimestamp > entity.messagesCursor) {
      entity.messagesCursor = newestTimestamp;
    }

    entity.lastSyncedAt = new Date();
    await entity.save();

    // Trigger distillation if enough messages accumulated
    if (newEntries.length >= 10) {
      const distilled = await distillMessages(newEntries, entity.entityName);
      const now = new Date();

      for (const category of Object.keys(distilled)) {
        if (
          Array.isArray(distilled[category]) &&
          distilled[category].length > 0 &&
          Array.isArray(entity.longTermContext[category])
        ) {
          const formatted = distilled[category].map((entry) => ({
            text: entry.text,
            date: entry.date || null,
            url: entry.url || null,
            source: entity.entityName,
            addedAt: now,
            contributorId: userId || null,
          }));
          entity.longTermContext[category].push(...formatted);
        }
      }

      await entity.save();
      console.log(
        `🧠 [Kafka] Distilled ${newEntries.length} messages for "${entity.entityName}"`
      );
    }
  } catch (err) {
    console.error("[Kafka] handleNetworkMessage error:", err.message);
  }
}

connectConsumer();

module.exports = consumer;

