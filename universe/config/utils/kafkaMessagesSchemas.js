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
 * @typedef {Object} CREATE_COMMUNITY_PAYLOAD
 * @property {String} _id
 * @property {String} title
 * @property {String} cover
 * @property {String} secondaryCover
 * @property {String} label
 * @property {Date} createdOn
 * @property {String[]} tag
 * @property {String[]} hiddenTags
 * @property {String} uid
 * @property {Object} universeMetaData
 */

const CREATE_COMMUNITY = {
  CREATE_COMMUNITY: {
    topicSuffix: "_create_community",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be an object");
      }

      const requiredStringFields = [
        "_id",
        "title",
        "cover",
        "secondaryCover",
        "label",
        "uid"
      ];

      const requiredArrayFields = ["tag", "hiddenTags"];

      for (const field of requiredStringFields) {
        if (typeof data[field] !== "string" || !data[field].trim()) {
          throw new Error(`'${field}' must be a non-empty string`);
        }
      }

      for (const field of requiredArrayFields) {
        if (
          !Array.isArray(data[field])
        ) {
          throw new Error(`'${field}' must be an array of strings`);
        }
      }

      const date = new Date(data.createdOn);
      if (isNaN(date.getTime())) {
        throw new Error("'createdOn' must be a valid ISO date string");
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
  }
}

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
 * @typedef {Object} UPDATE_MACBEASE_CONTENT_PAYLOAD
 * @property {String} contentId
 * @property {Object} updatedFields
 */

const UPDATE_MACBEASE_CONTENT = {
  UPDATE_MACBEASE_CONTENT: {
    topicSuffix: "_update_macbease_content",

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

module.exports = {
  ...ADD_USERTO_ORG,
  ...CREATE_USER,
  ...CREATE_COMMUNITY,
  ...UPDATE_CONTENT,
  ...UPDATE_MACBEASE_CONTENT,
  ...UPDATE_INVITATION,
  ...UPDATE_JOINLINK
}
