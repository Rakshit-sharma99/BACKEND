const { add_itinerary } = require("./itinerary_event_handlers/add_itinerary");
const {
  add_ticket_to_event_schema,
} = require("./ticket_event_handlers/add_ticket_to_event_schema");
const { update_event_stats } = require("./update_event_stats");
const { add_ticket_to_event } = require("./ticket_event_handlers/add_ticket_to_event");
const { add_member_to_channel } = require("./channel_event_handlers/add_member_to_channel");
const { delete_event } = require("./delete_event");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_add_itinerary`]: add_itinerary,
  [`${prefix}_add_ticket_to_event_schema`]: add_ticket_to_event_schema,
  [`${prefix}_update_event_stats`]: update_event_stats,
  [`${prefix}_add_ticket_to_event`]: add_ticket_to_event,
  [`${prefix}_add_member_to_channel`]: add_member_to_channel,
  [`${prefix}_delete_event`]: delete_event,
};

module.exports = { handlers };
