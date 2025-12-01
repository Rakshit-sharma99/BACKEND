const { rsvp_itinerary } = require("./rsvp_itinerary");

const prefix = process.env.KAFKA_CLIENT_ID;

const handlers = {
  [`${prefix}_rsvp_itinerary`]: rsvp_itinerary,
};

module.exports = { handlers };
