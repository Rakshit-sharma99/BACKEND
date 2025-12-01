/**
 * @typedef {Object} UPDATE_UNSORTED_PAYLOAD
 * @property {string[]} keywords
 * @property {string} unsorted
 */

const UPDATE_UNSORTED = {
  UPDATE_UNSORTED: {
    topicSuffix: "_update_unsorted",

    validate: (data) => {
        if (!Array.isArray(data.keyWords) || !data.keyWords.every(k => typeof k === "string")) {
          throw new Error("keyWords is required and must be an array of strings");
        }

        if (typeof data.unsorted !== "string") {
          throw new Error("unsorted is required and must be a string");
        }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} CREATE_UNSORTED_PAYLOAD
 * @property {string} keyWord
 */

const CREATE_UNSORTED = {
  CREATE_UNSORTED: {
    topicSuffix: "_create_unsorted",

    validate: (data) => {
      if (typeof data.keyWord !== "string") {
        throw new Error("keywords is required and must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },  
};


/**
 * @typedef {Object} DELETE_UNSORTED_PAYLOAD
 * @property {string} unsorted
 */

const DELETE_UNSORTED = {
  DELETE_UNSORTED: {
    topicSuffix: "_delete_unsorted",

    validate: (data) => {
      if (typeof data.unsorted !== "string") {
        throw new Error("unsorted is required and must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};


module.exports = {
  ...UPDATE_UNSORTED,
  ...CREATE_UNSORTED,
  ...DELETE_UNSORTED,
};
