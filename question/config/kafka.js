const { Kafka, logLevel } = require("kafkajs");
const {
  learnFromChat,
} = require("../controllers/questionLearningController");

const kafka = new Kafka({
  clientId: "question-service",
  brokers: ["kafka:9092"],
  logLevel: logLevel.INFO,
  retry: {
    initialRetryTime: 3000,
    retries: 10,
  },
});

const consumer = kafka.consumer({ groupId: "question-group" });

const connectConsumer = async () => {
  console.log("⏳ Question Service: Attempting to connect to Kafka...");

  while (true) {
    try {
      await consumer.connect();
      console.log("✅ Kafka Consumer connected (question-service)");

      await consumer.subscribe({ topic: "chat.completed" });

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          const eventData = JSON.parse(message.value.toString());
          console.log(`📩 Received event on ${topic}:`, {
            userId: eventData.userId,
            messageCount: eventData.messages?.length,
          });

          if (topic === "chat.completed") {
            // Extract questions from chat log
            await learnFromChat({
              body: {
                messages: eventData.messages,
                userId: eventData.userId,
                uid: eventData.uid,
                universeMetaData: eventData.universeMetaData,
              },
            });
          }
        },
      });

      break;
    } catch (error) {
      console.error(
        "❌ Kafka Consumer connection failed (question-service). Retrying in 5s...",
        error
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

connectConsumer();

module.exports = consumer;
