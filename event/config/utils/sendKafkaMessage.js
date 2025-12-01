const kafka_producer = require("../../config/kafka_producer");
const messageSchemas = require("./kafkaMessagesSchemas");

async function sendKafkaMessage(schemaKey, topicPrefix, payload) {
  const schema = messageSchemas[schemaKey];

  if (!schema) throw new Error(`Schema not found for ${schemaKey}`);

  schema.validate(payload);

  console.log("payload validated");

  await kafka_producer.producer.send({
    topic: `${topicPrefix}${schema.topicSuffix}`,
    messages: [schema.build(payload)],
  });

  console.log("msg send");
}

module.exports = { sendKafkaMessage };
