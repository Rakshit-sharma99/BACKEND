/**
 * @typedef {Object} DELIVER_REMINDER_PAYLOAD
 * @property {string} reminderId
 * @property {string} userId
 * @property {string} channel - push, in_app, etc.
 * @property {string} title
 * @property {string} body
 */

const DELIVER_REMINDER = {
  DELIVER_REMINDER: {
    topicSuffix: "_deliver_reminder",

    validate: (data) => {
      if (typeof data.reminderId !== "string") {
        throw new Error("'reminderId' must be a string");
      }
      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} REMINDER_INTERACTION_PAYLOAD
 * @property {string} reminderId
 * @property {string} userId
 * @property {string} action - clicked, dismissed, ignored
 */

const REMINDER_INTERACTION = {
  REMINDER_INTERACTION: {
    topicSuffix: "_reminder_interaction",

    validate: (data) => {
      if (typeof data.reminderId !== "string") {
        throw new Error("'reminderId' must be a string");
      }
      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }
      if (typeof data.action !== "string") {
        throw new Error("'action' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...DELIVER_REMINDER,
  ...REMINDER_INTERACTION,
};
