const { Kafka, logLevel } = require("kafkajs");
const { updateInsight } = require("../controllers/answerController");
const ExternalContext = require("../models/externalContext");
const { distillMessages, filterRelayableEntries } = require("../controllers/distillationHelper");

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
const producer = kafka.producer();

// ── Producer connection ──
let producerConnected = false;

const connectProducer = async () => {
  console.log("⏳ Knowledge Service: Connecting Kafka producer...");
  while (true) {
    try {
      await producer.connect();
      producerConnected = true;
      console.log("✅ Knowledge Kafka Producer connected");
      break;
    } catch (error) {
      console.error(
        "❌ Knowledge Kafka Producer connection failed. Retrying in 5s...",
        error.message
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

/**
 * Publish an event to a Kafka topic (for signal relay).
 */
async function publishEvent(topic, data) {
  if (!producerConnected) {
    console.warn(`⚠️ [Knowledge] Kafka producer not connected, skipping publish to ${topic}`);
    return;
  }
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(data) }],
    });
    console.log(`📤 [Knowledge] Published to ${topic}`);
  } catch (err) {
    console.error(`❌ [Knowledge] Failed to publish to ${topic}:`, err.message);
  }
}

// ── Consumer connection ──
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
 * Appends to hot context, triggers distillation when threshold is reached,
 * and emits signal.relay.candidate events for high-scoring entries.
 */
async function handleNetworkMessage(eventData) {
  const { uid, entityId, userId, messages } = eventData;
  if (!uid || !entityId || !messages || messages.length === 0) return;

  try {
    const entity = await ExternalContext.findOne({ uid, entityId });
    if (!entity || entity.status !== "synced") {
      console.log(`⏭️ [Kafka] Skipping entity ${entityId} — not found or not synced`);
      return;
    }

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

    console.log(
      `💾 [Kafka] Saved ${newEntries.length} hot entries for "${entity.entityName}" (total hot: ${entity.hotContext.entries.length})`
    );

    // ⚡ DEBUG MODE: Trigger distillation for EVERY message (threshold = 1)
    if (newEntries.length >= 1) {
      console.log(
        `\n${"─".repeat(50)}\n🧪 [Distill] Triggering for "${entity.entityName}" — ${newEntries.length} message(s)\n${"─".repeat(50)}`
      );

      // Log raw input
      for (const e of newEntries) {
        console.log(`   📥 [Distill] Input: "${e.text.slice(0, 120)}${e.text.length > 120 ? '...' : ''}" (from: ${e.sender})`);
      }

      const distilled = await distillMessages(newEntries, entity.entityName);
      const now = new Date();

      // Log distillation result per category
      console.log(`   📊 [Distill] Result breakdown:`);
      let totalDistilled = 0;
      for (const category of Object.keys(distilled)) {
        if (
          Array.isArray(distilled[category]) &&
          distilled[category].length > 0
        ) {
          for (const item of distilled[category]) {
            console.log(`      [${category}] "${item.text.slice(0, 100)}${item.text.length > 100 ? '...' : ''}" → relayScore: ${item.relayScore ?? 'N/A'}`);
          }

          if (Array.isArray(entity.longTermContext[category])) {
            const formatted = distilled[category].map((entry) => ({
              text: entry.text,
              date: entry.date || null,
              url: entry.url || null,
              source: entity.entityName,
              addedAt: now,
              contributorId: userId || null,
            }));
            entity.longTermContext[category].push(...formatted);
            totalDistilled += formatted.length;
          }
        }
      }

      if (totalDistilled === 0) {
        console.log(`   📊 [Distill] No distillable entries found (casual/irrelevant messages)`);
      }

      await entity.save();
      console.log(
        `🧠 [Distill] Saved ${totalDistilled} long-term entries for "${entity.entityName}"`
      );

      // ── Signal Relay: check for relay-worthy entries ──
      const relayCandidates = filterRelayableEntries(
        distilled,
        entityId,
        entity.entityName
      );

      console.log(
        `📡 [SignalRelay] Filter result: ${relayCandidates.length} relay-worthy out of ${totalDistilled} distilled entries`
      );

      if (relayCandidates.length > 0) {
        for (const candidate of relayCandidates) {
          console.log(
            `   📡 [SignalRelay] EMITTING → [${candidate.category}] score=${candidate.relayScore.toFixed(2)} "${candidate.text.slice(0, 80)}..."`
          );

          await publishEvent("signal.relay.candidate", {
            uid: uid.toString(),
            entityId,
            entityName: entity.entityName,
            platform: entity.platform || "whatsapp",
            entry: candidate,
          });

          console.log(`   📤 [SignalRelay] Published to signal.relay.candidate`);
        }
      } else {
        console.log(
          `   📡 [SignalRelay] No relay candidates (all scores below threshold or duplicates)`
        );
      }

      console.log(`${"─".repeat(50)}\n`);
    }
  } catch (err) {
    console.error("[Kafka] handleNetworkMessage error:", err.message);
  }
}

// Start connections
connectProducer();
connectConsumer();

module.exports = consumer;
