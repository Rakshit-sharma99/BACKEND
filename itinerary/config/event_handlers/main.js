const { itinerary_update_operation } = require("./itinerary_update_operation");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_itinerary_update_operation`]: itinerary_update_operation,
};

module.exports = { handlers };
