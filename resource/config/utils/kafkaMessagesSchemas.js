/**
 * @typedef {Object} CREATE_RESOURCE_PAYLOAD
 * @property {string} userId
 * @property {string} resourceId
 */

const CREATE_RESOURCE = {
  CREATE_RESOURCE: {
    topicSuffix: "_create_resource",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }

      if (typeof data.resourceId !== "string") {
        throw new Error("'resourceId' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} RESOURCE_REVIEW_SECONDARY_ACTION_PAYLOAD
 * @property {string} resourceId
 * @property {string} publisherId
 * @property {{ name: string, image: string,_id: string, pushToken:string }} reviewerInfo
 * @property {{ _id: ObjectId,... }} resourceInfo
 */

const RESOURCE_REVIEW_SECONDARY_ACTION = {
  RESOURCE_REVIEW_SECONDARY_ACTION: {
    topicSuffix: "_resource_review_secondary_action",

    validate: (data) => {
      if (typeof data.resourceId !== "string") {
        throw new Error("resourceId required in payload");
      }
      if (typeof data.publisherId !== "string") {
        throw new Error("publisherId required in payload");
      }
      if (
        !data.reviewerInfo ||
        typeof data.reviewerInfo.name !== "string" ||
        typeof data.reviewerInfo.image !== "string" ||
        typeof data.reviewerInfo._id !== "string"
      ) {
        throw new Error(
          "'reviewerInfo' must contain 'name','image','_id' and 'pushToken' as strings"
        );
      }
      if (!data.resourceInfo) {
        throw new Error("contentInfo is required");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} CREATE_RESOURCE_PAYLOAD
 * @property {string} userId
 * @property {string} resourceId
 */

const DELETE_RESOURCE = {
  DELETE_RESOURCE: {
    topicSuffix: "_delete_resource",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }

      if (typeof data.resourceId !== "string") {
        throw new Error("'resourceId' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...CREATE_RESOURCE,
  ...RESOURCE_REVIEW_SECONDARY_ACTION,
  ...DELETE_RESOURCE,
};
