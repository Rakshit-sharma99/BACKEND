const { Kafka, logLevel } = require("kafkajs");
const { handlers } = require("./event_handlers/main");

const prefix = process.env.KAFKA_CLIENT_ID;

const kafka = new Kafka({
  clientId: process.env.KAFKA_CLIENT_ID,
  brokers: ["kafka:9092"],
  logLevel: logLevel.INFO,
  retry: {
    initialRetryTime: 3000,
    retries: 10,
  },
});

const consumer = kafka.consumer({ groupId: process.env.KAFKA_GROUP_ID });

const connectConsumer = async () => {
  console.log(`⏳ Connecting to Kafka Consumer (${prefix})...`);
  while (true) {
    try {
      await consumer.connect();
      console.log(`✅ Kafka Consumer connected (${prefix})`);

      // Dynamically subscribe to all topics in handlers
      for (const topic of Object.keys(handlers)) {
        await consumer.subscribe({ topic });
        console.log(`🔗 Subscribed to topic: ${topic}`);
      }

      await consumer.run({
        eachMessage: async ({ topic, message }) => {
          const messageValue = message.value.toString();
          const handler = handlers[topic];
          console.log("messageValue", messageValue);
          if (handler) {
            try {
              await handler(messageValue);
            } catch (error) {
              console.error(
                `❌ Error processing message from ${topic}:`,
                error
              );
            }
          } else {
            console.warn(`⚠️ No handler for topic: ${topic}`);
          }
        },
      });
      break;
    } catch (error) {
      console.error(`❌ Kafka Consumer connection failed (${prefix})`, error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

connectConsumer();

module.exports = consumer;
