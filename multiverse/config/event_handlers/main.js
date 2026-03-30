const { create_universe } = require("./create_universe");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_create_universe`]: create_universe,
};

module.exports = { handlers };