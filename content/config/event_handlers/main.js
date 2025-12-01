const { update_content } = require("./universe_event_handlers/update_content");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_update_content`]: update_content,
};

module.exports = { handlers };
