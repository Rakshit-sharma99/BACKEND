const { update_joinlink } = require("./universe_event_handlers/update_joinlink");


const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_update_joinlink`]: update_joinlink,
};

module.exports = { handlers };
