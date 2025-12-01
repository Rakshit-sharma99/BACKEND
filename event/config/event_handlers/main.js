const { add_itinerary } = require("./itinerary_event_handlers/add_itinerary");
const {
  add_ticket_to_event_schema,
} = require("./ticket_event_handlers/add_ticket_to_event_schema");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_add_itinerary`]: add_itinerary,
  [`${prefix}_add_ticket_to_event_schema`]: add_ticket_to_event_schema,
};

module.exports = { handlers };
