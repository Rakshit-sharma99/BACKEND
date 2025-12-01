const { notify_tunedin_users } = require("./macbeaseContent_event_handlers/notify_tunedin_users");
const { create_community } = require("./universe_event_handlers/create_community");
const { create_user } = require("./universe_event_handlers/create_user");


const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_notify_tunedin_users`]: notify_tunedin_users,
  [`${prefix}_create_user`]: create_user,
  [`${prefix}_create_community`]: create_community,
};

module.exports = { handlers };
