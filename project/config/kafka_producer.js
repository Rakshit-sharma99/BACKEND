const { Kafka, logLevel } = require("kafkajs");

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
    try{
        await producer.connect();
        console.log("✅ Kafka producer connected (project service)");
    }catch(err){
        console.error("❌ Kafka connection failed (project)",err);
        process.exit(1);
    }
};

connectProducer();

module.exports = { producer }