const { Kafka, logLevel } = require("kafkajs");

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID,
  brokers: ["kafka:9092"],
  logLevel: logLevel.INFO,
  retry: {
    initialRetryTime: 3000, // Start with 3 seconds delay
    retries: 10, // Try 10 times before failing
  },
});

const producer = kafka.producer();

const connectProducer = async () => {
  try {
    await producer.connect();
    console.log("✅ Kafka Producer connected (itinerary)");
  } catch (error) {
    console.error("❌ Kafka connection failed (itinerary)", error);
    process.exit(1); // Restart the pod if Kafka is unavailable
  }
};

connectProducer();

module.exports = { producer };
