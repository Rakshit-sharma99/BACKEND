
/**
 * @typedef {Object} CREATE_PROJECT_PAYLOAD
 * @property {String} projectId
 * @property {String} title
 */

const CREATE_PROJECT = {
  CREATE_PROJECT: {
    topicSuffix: "_create_project",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be a non-null object.");
      }

      if (typeof data.projectId !== "string" || data.projectId.trim() === "") {
        throw new Error("'projectId' must be a non-empty string.");
      }
      if (typeof data.title !== "string" || data.title.trim() === "") {
        throw new Error("'title' must be a non-empty string.");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} ALLOT_USERS_TO_PROJECT_PAYLOAD
 * @property {String} projectId
 * @property {String[]} userIds
 * @property {String} title
 */

const ALLOT_USERS_TO_PROJECT = {
  ALLOT_USERS_TO_PROJECT: {
    topicSuffix: "_allot_users_to_project",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be a non-null object.");
      }

      if (typeof data.projectId !== "string" || data.projectId.trim() === "") {
        throw new Error("'projectId' must be a non-empty string.");
      }
      if (typeof data.title !== "string" || data.title.trim() === "") {
        throw new Error("'title' must be a non-empty string.");
      }
       if (
        !Array.isArray(data.userIds) ||
        data.userIds.length === 0 ||
        !data.userIds.every(
          (id) => typeof id === "string" && id.trim().length > 0
        )
      ) {
        throw new Error("'userIds' must be a non-empty array of non-empty strings.");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} PROJECT_CHAT_MESSAGE_PAYLOAD
 * @property {String} projectId
 * @property {String[]} userIds
 * @property {String} title
 * @property {String} message
 * @property {String} sender
 */

const PROJECT_CHAT_MESSAGE = {
  PROJECT_CHAT_MESSAGE: {
    topicSuffix: "_project_chat_message",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be a non-null object.");
      }

      if (typeof data.projectId !== "string" || data.projectId.trim() === "") {
        throw new Error("'projectId' must be a non-empty string.");
      }
      if (typeof data.title !== "string" || data.title.trim() === "") {
        throw new Error("'title' must be a non-empty string.");
      }
      if (typeof data.message !== "string" || data.message.trim() === "") {
        throw new Error("'message' must be a non-empty string.");
      }
      if (typeof data.sender !== "string" || data.sender.trim() === "") {
        throw new Error("'sender' must be a non-empty string.");
      }
       if (
        !Array.isArray(data.userIds) ||
        data.userIds.length === 0 
      ) {
        throw new Error("'userIds' must be a non-empty array.");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} ALLOT_CHATROOM_PAYLOAD
 * @property {String} chatDoc
 * @property {String[]} userIds
 */

const ALLOT_CHATROOM = {
  ALLOT_CHATROOM: {
    topicSuffix: "_allot_chatroom",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be a non-null object.");
      }

      if (typeof data.chatDoc !== "object") {
        throw new Error("'chatDoc' must be an object.");
      }
       if (
        !Array.isArray(data.userIds) ||
        data.userIds.length === 0 
      ) {
        throw new Error("'userIds' must be a non-empty array.");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...CREATE_PROJECT,
  ...ALLOT_USERS_TO_PROJECT,
  ...PROJECT_CHAT_MESSAGE,
  ...ALLOT_CHATROOM
}
