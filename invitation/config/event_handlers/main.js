const { update_invitation } = require("./universe_event_handlers/update_invitation");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_update_invitation`]: update_invitation,
};

module.exports = { handlers };
