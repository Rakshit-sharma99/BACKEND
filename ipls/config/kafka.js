const { Kafka, logLevel } = require("kafkajs");
const Log = require("../models/log");

const kafka = new Kafka({
  clientId: "ipls-service",
  brokers: ["kafka:9092"],
  logLevel: logLevel.INFO,
  retry: {
    initialRetryTime: 3000, // Start with 3s delay
    retries: 10, // Maximum retry attempts
  },
});

const consumer = kafka.consumer({ groupId: "ipls-group" });

const connectConsumer = async () => {
  console.log("⏳ Attempting to connect to Kafka...");

  while (true) {
    try {
      await consumer.connect();
      console.log("✅ Kafka Consumer connected");

      await consumer.subscribe({ topic: "ip-transaction-log" });

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const eventData = JSON.parse(message.value.toString());
          console.log(`📩 Received event on ${topic}:`, eventData);

          // Ensure valid event data before saving
          if (eventData.c_source && eventData.d_source && eventData.ip) {
            const logEntry = new Log({
              c_source: eventData.c_source,
              d_source: eventData.d_source,
              c_ref: eventData?.c_ref,
              d_ref: eventData?.d_ref,
              description: eventData?.description,
              ip: eventData.ip,
              status: eventData?.status,
            });

            await logEntry.save();
          }
        },
      });

      break; // Exit loop if successful
    } catch (error) {
      console.error(
        "❌ Kafka Consumer connection failed. Retrying in 5s...",
        error
      );
      await new Promise((resolve) => setTimeout(resolve, 5000)); // Wait before retrying
    }
  }
};

// Start consumer when service starts
connectConsumer();

module.exports = consumer;
