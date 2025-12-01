const { update_macbease_content } = require("./universe_event_handlers/update_macbease_content");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_update_macbease_content`]: update_macbease_content,
};

module.exports = { handlers };
