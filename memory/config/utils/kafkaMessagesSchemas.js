/**
 * @typedef {Object} UPDATE_USER_MEMORY_LIST_PAYLOAD
 * @property {string} id
 * @property {string} memoryId
 * @property {"add"|"remove"} operation
 */

const UPDATE_USER_MEMORY_LIST = {
  UPDATE_USER_MEMORY_LIST: {
    topicSuffix: "_update_user_memory_list",

    validate: (data) => {
      if (typeof data.id !== "string") {
        throw new Error("id must be string");
      }
      if (typeof data.memoryId !== "string") {
        throw new Error("memory id must be string");
      }
      if (!["add", "remove"].includes(data.operation)) {
        throw new Error("operation must be 'add' or 'remove'");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};


/**
 * @typedef {Object} UPDATE_CLUB_MEMORY_LIST_PAYLOAD
 * @property {string} id
 * @property {string} memoryId
 * @property {"add"|"remove"} operation
 */

const UPDATE_CLUB_MEMORY_LIST = {
  UPDATE_CLUB_MEMORY_LIST: {
    topicSuffix: "_update_club_memory_list",

    validate: (data) => {
      if (typeof data.id !== "string") {
        throw new Error("id must be string");
      }
      if (typeof data.memoryId !== "string") {
        throw new Error("memory id must be string");
      }
      if (!["add", "remove"].includes(data.operation)) {
        throw new Error("operation must be 'add' or 'remove'");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};
/**
 * @typedef {Object} UPDATE_MEMORY_LIST_PAYLOAD
 * @property {string} id
 * @property {string[]} validPeopleTags

 */

const UPDATE_MEMORY_LIST = {
  UPDATE_MEMORY_LIST: {
    topicSuffix: "_update_memory_list",

    validate: (data) => {
      if (typeof data.id !== "string") {
        throw new Error("id must be string");
      }

      if (!Array.isArray(data.validPeopleTags) || data.validPeopleTags.length===0) {
        throw new Error("'validPeopleTags' must be non-empty array");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} UPDATE_USERS_MEMORY_NOTICE_PAYLOAD
 * @property {string[]} validPeopleTags
 * @property {Object} notice
 */

const UPDATE_USER_MEMORY_NOTICE = {
  UPDATE_USER_MEMORY_NOTICE: {
    topicSuffix: "_update_user_memory_notice",

    validate: (data) => {
       if (!data.notice || typeof data.notice !== "object") {
        throw new Error("'notice' must be a valid object.");
      }

      if (!Array.isArray(data.validPeopleTags) || data.validPeopleTags.length===0) {
        throw new Error("'validPeopleTags' must be non-empty array");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} UPDATE_USER_PINNED_MEMORY_PAYLOAD
 * @property {string} id
 * @property {string} memoryId
 * @property {"add"|"remove"} operation
 */

const UPDATE_USER_PINNED_MEMORY = {
  UPDATE_USER_PINNED_MEMORY: {
    topicSuffix: "_update_user_pinned_memory",

    validate: (data) => {
      if (typeof data.id !== "string") {
        throw new Error("id must be string");
      }
      if (typeof data.memoryId !== "string") {
        throw new Error("memory id must be string");
      }
      if (!["add", "remove"].includes(data.operation)) {
        throw new Error("operation must be 'add' or 'remove'");
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
  ...UPDATE_USER_MEMORY_LIST,
  ...UPDATE_CLUB_MEMORY_LIST,
  ...UPDATE_MEMORY_LIST,
  ...UPDATE_USER_MEMORY_NOTICE,
  ...UPDATE_USER_PINNED_MEMORY,
  ...USER_ACTIVITY,
};
