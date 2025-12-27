const { create_memory } = require('./create_memory');

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_create_memory`]: create_memory,
};

module.exports = { handlers };
