const { Kafka, logLevel } = require("kafkajs");
const { updateInsight } = require("../controllers/answerController");

const kafka = new Kafka({
  clientId: "knowledge-service",
  brokers: ["kafka:9092"],
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

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const eventData = JSON.parse(message.value.toString());
          console.log(`📩 Received event on ${topic}:`, {
            questionId: eventData.questionId,
            userId: eventData.userId,
          });

          if (topic === "answer.submitted") {
            // Re-aggregate insight when a new answer comes in
            await updateInsight(
              eventData.questionId,
              eventData.uid,
              eventData.universeMetaData
            );
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

connectConsumer();

module.exports = consumer;
