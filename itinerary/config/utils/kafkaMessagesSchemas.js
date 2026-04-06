/**
 * @typedef {Object} ADD_ITINERARY_PAYLOAD
 * @property {String} eventId
 * @property {String} itineraryId
 */

const ADD_ITINERARY = {
  ADD_ITINERARY: {
    topicSuffix: "_add_itinerary",

    validate: (data) => {
      if (typeof data.eventId !== "string" || !data.eventId.trim()) {
        throw new Error("'eventId' must be a non-empty string'");
      }

      if (typeof data.itineraryId !== "string" || !data.itineraryId.trim()) {
        throw new Error("'itineraryId' must be a non-empty string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} ADD_ITINERARY_PAYLOAD
 * @property {String} itineraryId
 * @property {String} ticketId
 */

const RSVP_ITINERARY = {
  RSVP_ITINERARY: {
    topicSuffix: "_rsvp_itinerary",

    validate: (data) => {
      if (typeof data.itineraryId !== "string" || !data.itineraryId.trim()) {
        throw new Error("'itineraryId' must be a non-empty string'");
      }

      if (typeof data.ticketId !== "string" || !data.ticketId.trim()) {
        throw new Error("'ticketId' must be a non-empty string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} UPDATE_CLUB_ITINERARIES_PAYLOAD
 * @property {String} clubId
 * @property {String} eventId
 * @property {String} itineraryId
 */

const UPDATE_CLUB_ITINERARIES = {
  UPDATE_CLUB_ITINERARIES: {
    topicSuffix: "_update_club_itineraries",

    validate: (data) => {
      if (typeof data.clubId !== "string" || !data.clubId.trim()) {
        throw new Error("'clubId' must be a non-empty string");
      }
      if (typeof data.eventId !== "string" || !data.eventId.trim()) {
        throw new Error("'eventId' must be a non-empty string");
      }
      if (typeof data.itineraryId !== "string" || !data.itineraryId.trim()) {
        throw new Error("'itineraryId' must be a non-empty string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...ADD_ITINERARY,
  ...RSVP_ITINERARY,
  ...UPDATE_CLUB_ITINERARIES,
};
