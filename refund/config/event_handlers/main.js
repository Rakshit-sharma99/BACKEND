const { create_refund } = require("./create_refund");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_create_refund`]: create_refund,
};

module.exports = { handlers };
