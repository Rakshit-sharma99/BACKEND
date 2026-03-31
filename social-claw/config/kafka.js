const { Kafka, logLevel } = require("kafkajs");

const kafka = new Kafka({
  clientId: "social-claw-service",
  brokers: [process.env.KAFKA_BROKER || "kafka:9092"],
  logLevel: logLevel.WARN,
  retry: {
    initialRetryTime: 3000,
    retries: 10,
  },
});

const producer = kafka.producer();

let connected = false;

const connectProducer = async () => {
  console.log("⏳ Social Claw: Connecting Kafka producer...");
  while (true) {
    try {
      await producer.connect();
      connected = true;
      console.log("✅ Social Claw Kafka Producer connected");
      break;
    } catch (error) {
      console.error(
        "❌ Social Claw Kafka Producer connection failed. Retrying in 5s...",
        error.message,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

/**
 * Publish an event to a Kafka topic.
 * Silently fails if not connected (non-critical path).
 */
async function publishEvent(topic, data) {
  if (!connected) {
    console.warn(`⚠️ Kafka not connected, skipping publish to ${topic}`);
    return;
  }
  try {
    await producer.send({
      topic,
      messages: [{ value: JSON.stringify(data) }],
    });
    console.log(`📤 Published to ${topic}`);
  } catch (err) {
    console.error(`Failed to publish to ${topic}:`, err.message);
  }
}

// Start producer connection
connectProducer();

module.exports = { publishEvent };
