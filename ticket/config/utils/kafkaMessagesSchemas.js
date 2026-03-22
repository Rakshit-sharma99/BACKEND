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

/**
 * @typedef {Object} ITINERARY_UPDATE_OPERATION_PAYLOAD
 * @property {"SET"|"PUSH"|"PULL"|"INC"} operation
 * @property {"SINGLE"|"MULTIPLE"} targetType
 * @property {string} field                // field name in itinerary
 * @property {*} value                     // value to apply
 * @property {string} itineraryId         // SINGLE
 * @property {string[]} [itineraryIds]      // MULTIPLE
 */

const ITINERARY_UPDATE_OPERATION = {
  CREATE_REFUND: {
    topicSuffix: "_itinerary_update_operation",

    validate: (data) => {
      const { operation, targetType, field } = data;

      if (!["SET", "PUSH", "PULL", "INC"].includes(operation)) {
        throw new Error("Invalid operation type");
      }

      if (!["SINGLE", "MULTIPLE"].includes(targetType)) {
        throw new Error("Invalid targetType");
      }

      if (!field || typeof field !== "string") {
        throw new Error("field must be a string");
      }

      if (typeof payload.value === "undefined") {
        throw new Error("value is required");
      }

      if (targetType === "SINGLE" && !data.itineraryId) {
        throw new Error("itineraryId required for SINGLE");
      }

      if (
        targetType === "MULTIPLE" &&
        (!Array.isArray(data.itineraryIds) || data.itineraryIds.length === 0)
      ) {
        throw new Error("itineraryIds must be non-empty array");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} UPDATE_EVENT_STATS_PAYLOAD
 * @property {String} eventId
 * @property {String} amtPaid
 * @property {String} userField
 */

const UPDATE_EVENT_STATS = {
  UPDATE_EVENT_STATS: {
    topicSuffix: '_update_event_stats',

    validate: (data) => {

      if (!data.eventId || !typeof data.eventId === 'string') {
        throw new Error('eventId must be string');
      }

      if (!data.amtPaid || !typeof data.amtPaid === 'number') {
        throw new Error('amtPaid must be number');
      }

      if (!data.userField || !typeof data.userField === 'string') {
        throw new Error('userField must be string');
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} ADD_TICKET_TO_EVENT_PAYLOAD
 * @property {String} eventId
 * @property {String} ticketId
 */

const ADD_TICKET_TO_EVENT = {
  ADD_TICKET_TO_EVENT: {
    topicSuffix: '_add_ticket_to_event',

    validate: (data) => {

      if (!data.eventId || !typeof data.eventId === 'string') {
        throw new Error('eventId must be string');
      }

      if (!data.ticketId || !typeof data.ticketId === 'string') {
        throw new Error('ticketId must be string');
      }

    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} ADD_TICKET_TO_USER_PAYLOAD
 * @property {String} userId
 * @property {String} ticketId
 */

const ADD_TICKET_TO_USER = {
  ADD_TICKET_TO_USER: {
    topicSuffix: '_add_ticket_to_user',

    validate: (data) => {

      if (!data.userId || !typeof data.userId === 'string') {
        throw new Error('userId must be string');
      }

      if (!data.ticketId || !typeof data.ticketId === 'string') {
        throw new Error('ticketId must be string');
      }

    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};


/**
 * @typedef {Object} UPDATE_COUPON_PAYLOAD
 * @property {String} couponId
 * @property {String} userId
 */

const UPDATE_COUPON = {
  UPDATE_COUPON: {
    topicSuffix: '_update_coupon',

    validate: (data) => {

      if (!data.userId || !typeof data.userId === 'string') {
        throw new Error('userId must be string');
      }

      if (!data.couponId || !typeof data.couponId === 'string') {
        throw new Error('couponId must be string');
      }

    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} CREDIT_TICKET_SALE_PAYLOAD
 * @property {String} clubId
 * @property {String} eventId
 * @property {String} eventName
 * @property {String} ticketId
 * @property {String} paymentId
 * @property {Number} grossChargePaise
 * @property {Number} platformFeePaise
 * @property {Number} clubNetCreditPaise
 * @property {String} currency
 * @property {String} ticketType
 * @property {String} userId
 */

const CREDIT_TICKET_SALE = {
  CREDIT_TICKET_SALE: {
    topicSuffix: "_credit_ticket_sale",

    validate: (data) => {
      const requiredStringFields = [
        "clubId",
        "eventId",
        "eventName",
        "ticketId",
        "paymentId",
        "currency",
        "ticketType",
        "userId",
      ];

      for (const field of requiredStringFields) {
        if (typeof data[field] !== "string" || !data[field].trim()) {
          throw new Error(`'${field}' must be a non-empty string`);
        }
      }

      const requiredNumberFields = [
        "grossChargePaise",
        "platformFeePaise",
        "clubNetCreditPaise",
      ];

      for (const field of requiredNumberFields) {
        if (!Number.isInteger(data[field]) || data[field] < 0) {
          throw new Error(`'${field}' must be a non-negative integer`);
        }
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};
/**
 * @typedef {Object} USER_ACTIVITY_PAYLOAD
 * @property {string} userId
 * @property {string} uid
 * @property {string} activityType
 * @property {string} [ref]
 */

const USER_ACTIVITY = {
  USER_ACTIVITY: {
    topicSuffix: ".activity",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }
      if (typeof data.activityType !== "string") {
        throw new Error("'activityType' must be a string");
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
  ...ITINERARY_UPDATE_OPERATION,
  ...UPDATE_EVENT_STATS,
  ...ADD_TICKET_TO_EVENT,
  ...ADD_TICKET_TO_USER,
  ...UPDATE_COUPON,
  ...CREDIT_TICKET_SALE,
  ...USER_ACTIVITY,
};
