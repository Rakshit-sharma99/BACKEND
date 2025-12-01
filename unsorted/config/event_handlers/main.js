const { create_unsorted } = require("./bag_event_handlers/create_unsorted");
const { delete_unsorted } = require("./bag_event_handlers/delete_unsorted");
const { update_unsorted } = require("./bag_event_handlers/update_unsorted");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_update_unsorted`]: update_unsorted,
  [`${prefix}_create_unsorted`]: create_unsorted,
  [`${prefix}_delete_unsorted`]: delete_unsorted,
};

module.exports = { handlers };
