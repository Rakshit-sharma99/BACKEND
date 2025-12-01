const { add_userto_org } = require("./universe_event_handlers/add_userto_org");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
    [`${prefix}_add_userto_org`]: add_userto_org,
}

module.exports = {handlers}