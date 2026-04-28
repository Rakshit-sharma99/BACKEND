/**
 * @typedef {Object} FEATURED_SECONDARY_ACTION_PAYLOAD
 * @property {string} clubId
 * @property {string} eventId
 * @property {string} eventName
 * @property {string} eventPoster
 * @property {string} eventManagerMail
 */

const FEATURED_SECONDARY_ACTION = {
  FEATURED_SECONDARY_ACTION: {
    topicSuffix: '_featured_secondary_action',

    validate: (data) => {
      if (typeof data.clubId !== 'string') {
        throw new Error("'clubId' must be a string");
      }

      if (typeof data.eventId !== 'string') {
        throw new Error("'eventId' must be a string");
      }

      if (typeof data.eventName !== 'string') {
        throw new Error("'eventName' must be a string");
      }

      if (typeof data.eventPoster !== 'string') {
        throw new Error("'eventPoster' must be a string");
      }

      if (typeof data.eventManagerMail !== 'string') {
        throw new Error("'eventManagerMail' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} ASK_FOR_REVIEW_PAYLOAD
 * @property {string} userId
 * @property {string} eventName
 * @property {string} eventPoster
 */

const ASK_FOR_REVIEW = {
  ASK_FOR_REVIEW: {
    topicSuffix: '_ask_for_review',

    validate: (data) => {
      if (typeof data.userId !== 'string') {
        throw new Error("'userId' must be a string");
      }

      if (typeof data.eventName !== 'string') {
        throw new Error("'eventName' must be a string");
      }

      if (typeof data.eventPoster !== 'string') {
        throw new Error("'eventPoster' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} EDIT_EVENT_PAYLOAD
 * @property {string} clubId
 * @property {string} eventId
 * @property {{url: string,description: string,ticketTypes: array}} newData
 */

const EDIT_EVENT = {
  EDIT_EVENT: {
    topicSuffix: '_edit_event',

    validate: (data) => {
      if (typeof data.clubId !== 'string') {
        throw new Error("'clubId' must be a string");
      }

      if (typeof data.eventId !== 'string') {
        throw new Error("'eventId' must be a string");
      }

      if (!data.newData) {
        throw new Error('newData is required');
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} CREATE_MEMORY_PAYLOAD
 * @property {Object} memoryData
 */

const CREATE_MEMORY = {
  CREATE_MEMORY: {
    topicSuffix: '_create_memory',

    validate: (data) => {

      if (!data.memoryData || typeof data.memoryData !== 'object') {
        throw new Error('memoryData must be object');
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...FEATURED_SECONDARY_ACTION,
  ...ASK_FOR_REVIEW,
  ...EDIT_EVENT,
  ...CREATE_MEMORY
};
