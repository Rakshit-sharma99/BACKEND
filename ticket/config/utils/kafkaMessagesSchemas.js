/**
 * @typedef {Object} ADD_TICKET_TO_USER_SCHEMA_PAYLOAD
 * @property {string} userId
 * @property {string} ticketId
 * @property {{ eventId:string, eventName: string, eventPoster: string, eventManagerMail: string }} eventData
 */

const ADD_TICKET_TO_USER_SCHEMA = {
  ADD_TICKET_TO_USER_SCHEMA: {
    topicSuffix: "_add_ticket_to_user_schema",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }

      if (typeof data.ticketId !== "string") {
        throw new Error("'ticketId' must be a string");
      }

      if (
        !data.eventData ||
        typeof data.eventData.eventId !== "string" ||
        typeof data.eventData.eventName !== "string" ||
        typeof data.eventData.eventPoster !== "string" ||
        typeof data.eventData.eventManagerMail !== "string"
      ) {
        throw new Error(
          "'eventData' must contain 'eventId', 'eventName', 'eventPoster' and 'eventManagerMail'"
        );
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} ADD_TICKET_TO_EVENT_SCHEMA_PAYLOAD
 * @property {string} eventId
 * @property {string} ticketId
 * @property {number} amtPaid
 * @property {string} userField
 */

const ADD_TICKET_TO_EVENT_SCHEMA = {
  ADD_TICKET_TO_EVENT_SCHEMA: {
    topicSuffix: "_add_ticket_to_event_schema",

    validate: (data) => {
      if (typeof data.eventId !== "string") {
        throw new Error("'eventId' must be a string");
      }

      if (typeof data.ticketId !== "string") {
        throw new Error("'ticketId' must be a string");
      }

      if (typeof data.amtPaid !== "number") {
        throw new Error("'amtPaid' must be a number");
      }

      if (typeof data.userField !== "string") {
        throw new Error("'userField' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} CREATE_REFUND_PAYLOAD
 * @property {string} paymentId
 * @property {string} eventId
 * @property {string} userId
 * @property {string} amtPaid
 * @property {string} refundStatus
 */

const CREATE_REFUND = {
  CREATE_REFUND: {
    topicSuffix: "_create_refund",

    validate: (data) => {
      if (typeof data.paymentId !== "string") {
        throw new Error("'paymentId' must be a string");
      }

      if (typeof data.eventId !== "string") {
        throw new Error("'eventId' must be a string");
      }

      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }

      if (typeof data.amtPaid !== "string") {
        throw new Error("'amtPaid' must be a string");
      }

      if (typeof data.refundStatus !== "string") {
        throw new Error("'refundStatus' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...ADD_TICKET_TO_USER_SCHEMA,
  ...ADD_TICKET_TO_EVENT_SCHEMA,
  ...CREATE_REFUND,
};
