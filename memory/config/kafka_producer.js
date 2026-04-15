const { Kafka, logLevel } = require("kafkajs");

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

const producer = kafka.producer();

const connectProducer = async () => {
  console.log(`⏳ Connecting to Kafka Producer (${prefix})...`);
  while (true) {
    try {
      await producer.connect();
      console.log(`✅ Kafka Producer connected (${prefix})`);
      break;
    } catch (error) {
      console.error(`❌ Kafka Producer connection failed (${prefix}), retrying in 5s...`, error);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
};

connectProducer();

module.exports = { producer };
