/**
 * @typedef {Object} ADD_USERTO_ORG_PAYLOAD
 * @property {string} orgId
 * @property {string} userId
 */

const ADD_USERTO_ORG = {
  ADD_USERTO_ORG: {
    topicSuffix: "_add_userto_org",

    validate: (data) => {

      if (typeof data.orgId !== "string") {
        throw new Error("'orgId' must be a string");
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
 * @typedef {Object} CREATE_USER_PAYLOAD
 * @property {String} _id
 * @property {"Student" || "Professor" || "Alumni"} profession
 * @property {String} name
 * @property {Number} reg
 * @property {String} course
 * @property {String} field
 * @property {String} passoutYear
 * @property {String} level
 * @property {String} email
 * @property {String} image
 * @property {String[]} interests
 * @property {String} uid
 * @property {Object} universeMetaData
 * 
 */

const CREATE_USER = {
  CREATE_USER: {
    topicSuffix: "_create_user",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be an object");
      }

      const requiredStringFields = [
        "_id",
        "name",
        "email",
        "image",
        "uid",
      ];


      const allowedProfessions = ["Student", "Professor", "Alumni"];

      if (!allowedProfessions.includes(data.profession)) {
        throw new Error(
          `'profession' must be one of: ${allowedProfessions.join(", ")}`
        );
      }

      for (const field of requiredStringFields) {
        if (typeof data[field] !== "string" || !data[field].trim()) {
          throw new Error(`'${field}' must be a non-empty string`);
        }
      }

      if (
        !Array.isArray(data.interests) ||
        !data.interests.every((item) => typeof item === "string")
      ) {
        throw new Error("'interests' must be an array of strings");
      }

      if (
        typeof data.universeMetaData !== "object" ||
        data.universeMetaData === null ||
        Array.isArray(data.universeMetaData)
      ) {
        throw new Error("'universeMetaData' must be a valid object");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};


/**
 * @typedef {Object} UPDATE_CONTENT_PAYLOAD
 * @property {String} contentId
 * @property {Object} updatedFields
 */

const UPDATE_CONTENT = {
  UPDATE_CONTENT: {
    topicSuffix: "_update_content",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be an object");
      }

      const requiredStringFields = [
        "contentId"
      ];

      for (const field of requiredStringFields) {
        if (typeof data[field] !== "string" || !data[field].trim()) {
          throw new Error(`'${field}' must be a non-empty string`);
        }
      }

      if (
        typeof data.updatedFields !== "object" ||
        data.updatedFields === null ||
        Array.isArray(data.updatedFields)
      ) {
        throw new Error("'updatedFields' must be a valid object");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  }
}

/**
 * @typedef {Object} UPDATE_INVITATION_PAYLOAD
 * @property {String} invitationId
 * @property {Object} updatedFields
 */

const UPDATE_INVITATION = {
  UPDATE_INVITATION: {
    topicSuffix: "_update_invitation",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be an object");
      }

      const requiredStringFields = [
        "invitationId"
      ];

      for (const field of requiredStringFields) {
        if (typeof data[field] !== "string" || !data[field].trim()) {
          throw new Error(`'${field}' must be a non-empty string`);
        }
      }

      if (
        typeof data.updatedFields !== "object" ||
        data.updatedFields === null ||
        Array.isArray(data.updatedFields)
      ) {
        throw new Error("'updatedFields' must be a valid object");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  }
}

/**
 * @typedef {Object} UPDATE_JOINLINK_PAYLOAD
 * @property {String} joinLinkId
 * @property {String} userId
 */

const UPDATE_JOINLINK = {
  UPDATE_JOINLINK: {
    topicSuffix: "_update_joinlink",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be an object");
      }

      const requiredStringFields = [
        "joinLinkId",
        "userId"
      ];

      for (const field of requiredStringFields) {
        if (typeof data[field] !== "string" || !data[field].trim()) {
          throw new Error(`'${field}' must be a non-empty string`);
        }
      }

    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  }
}

/**
 * @typedef {Object} CREATE_MEMORY_PAYLOAD
 * @property {Object} memoryData
 */

const CREATE_MEMORY = {
  EDIT_EVENT: {
    topicSuffix: '_create_memory',

    validate: (data) => {

      if (!data.memoryData || !typeof data.memoryData === 'object') {
        throw new Error('memoryData must be object');
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
 * @property {string} activityType - one of: club_join, event_attend, memory_upload, first_post, assets_added
 * @property {string} [ref] - optional reference ID (clubId, eventId, etc.)
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

/**
 * @typedef {Object} USER_SIGNUP_PAYLOAD
 * @property {string} userId
 * @property {string} uid
 * @property {string} name
 * @property {string[]} interests
 * @property {string} profession
 * @property {Object} universeMetaData
 */

const USER_SIGNUP = {
  USER_SIGNUP: {
    topicSuffix: ".signup",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }
      if (typeof data.name !== "string") {
        throw new Error("'name' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} CREATE_UNIVERSE_PAYLOAD
 * @property {String} name
 * @property {String} callSign
 * @property {String} logo
 * @property {String} logoKey
 * @property {String} location
 * @property {Number} lat
 * @property {Number} lng
 */

const CREATE_UNIVERSE = {
  CREATE_UNIVERSE: {
    topicSuffix: "_create_universe",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be an object");
      }

      const requiredStringFields = [
        "name",
        "callSign",
        "logo",
        "logoKey",
        "location"
      ];

      for (const field of requiredStringFields) {
        if (typeof data[field] !== "string" || !data[field].trim()) {
          throw new Error(`'${field}' must be a non-empty string`);
        }
      }

      if (typeof data.lat !== "number") {
        throw new Error("'lat' must be a number");
      }

      if (typeof data.lng !== "number") {
        throw new Error("'lng' must be a number");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  }
}

/**
 * @typedef {Object} DELETE_EVENT_PAYLOAD
 * @property {string} eventId
 */

const DELETE_EVENT = {
  DELETE_EVENT: {
    topicSuffix: "_delete_event",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be an object");
      }
      if (typeof data.eventId !== "string" || !data.eventId.trim()) {
        throw new Error("'eventId' must be a non-empty string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...ADD_USERTO_ORG,
  ...CREATE_USER,
  ...UPDATE_CONTENT,
  ...UPDATE_INVITATION,
  ...UPDATE_JOINLINK,
  ...CREATE_MEMORY,
  ...USER_ACTIVITY,
  ...USER_SIGNUP,
  ...CREATE_UNIVERSE,
  ...DELETE_EVENT
}
