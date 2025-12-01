/**
 * @typedef {Object} PERSON_TAG_PAYLOAD
 * @property {'club' | 'userCommunity'} sendBy
 * @property {string} taggedUser
 * @property {{ name: string, image: string }} sender
 * @property {string} processedUrl
 * @property {{ _id: ObjectId,... }} content
 */

const PERSON_TAG = {
  PERSON_TAG: {
    topicSuffix: "_person_tag",

    validate: (data) => {
      if (data.sendBy !== "club" && data.sendBy !== "userCommunity") {
        throw new Error("'sendBy' must be 'club' or 'userCommunity'");
      }

      if (typeof data.taggedUser !== "string") {
        throw new Error("'taggedUser' must be a string");
      }

      if (
        !data.sender ||
        typeof data.sender.name !== "string" ||
        typeof data.sender.image !== "string"
      ) {
        throw new Error("'sender' must contain 'name' and 'image' as strings");
      }

      if (typeof data.processedUrl !== "string") {
        throw new Error("'processedUrl' must be a string");
      }

      if (!data.content) {
        throw new Error("content is required");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} LIKE_CONTENT_PAYLOAD
 * @property {string} contentId
 * @property {string} userId
 * @property {'club' | 'community'} type
 */

const LIKE_CONTENT = {
  LIKE_CONTENT: {
    topicSuffix: "_like_content",

    validate: (data) => {
      if (typeof data.contentId !== "string") {
        throw new Error("contentId required in payload");
      }
      if (typeof data.userId !== "string") {
        throw new Error("userId required in payload");
      }
      if (data.type !== "club" && data.type !== "community") {
        throw new Error("'type' must be 'club' or 'community'");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} LIKE_CONTENT_SECONDARY_ACTION_PAYLOAD
 * @property {string} contentId
 * @property {string} publisherId
 * @property {{ name: string, image: string,_id: string, pushToken:string }} userInfo
 * @property {{ _id: ObjectId,... }} contentInfo
 */

const LIKE_CONTENT_SECONDARY_ACTION = {
  LIKE_CONTENT_SECONDARY_ACTION: {
    topicSuffix: "_like_content_secondary_action",

    validate: (data) => {
      if (typeof data.contentId !== "string") {
        throw new Error("contentId required in payload");
      }
      if (typeof data.publisherId !== "string") {
        throw new Error("publisherId required in payload");
      }
      if (
        !data.userInfo ||
        typeof data.userInfo.name !== "string" ||
        typeof data.userInfo.image !== "string" ||
        typeof data.userInfo._id !== "string" ||
        typeof data.userInfo.pushToken !== "string"
      ) {
        throw new Error(
          "'userInfo' must contain 'name','image','_id' and 'pushToken' as strings"
        );
      }
      if (!data.contentInfo) {
        throw new Error("contentInfo is required");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} COMMENT_CONTENT_PAYLOAD
 * @property {string} cid
 * @property {string} userId
 * @property {string} contentId
 * @property {'club' | 'community'} type
 */

const COMMENT_CONTENT = {
  COMMENT_CONTENT: {
    topicSuffix: "_comment_content",

    validate: (data) => {
      if (typeof data.cid !== "string") {
        throw new Error("cid required in payload");
      }
      if (typeof data.userId !== "string") {
        throw new Error("userId required in payload");
      }
      if (typeof data.contentId !== "string") {
        throw new Error("contentId required in payload");
      }
      if (data.type !== "club" && data.type !== "community") {
        throw new Error("'type' must be 'club' or 'community'");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} UNLIKE_CONTENT_PAYLOAD
 * @property {string} userId
 * @property {string} contentId
 */

const UNLIKE_CONTENT = {
  UNLIKE_CONTENT: {
    topicSuffix: "_unlike_content",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("userId required in payload");
      }
      if (typeof data.contentId !== "string") {
        throw new Error("contentId required in payload");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} CLEAR_FEED_PAYLOAD
 * @property {string} userId
 */

const CLEAR_FEED = {
  CLEAR_FEED: {
    topicSuffix: "_clear_feed",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("userId required in payload");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...PERSON_TAG,
  ...LIKE_CONTENT,
  ...LIKE_CONTENT_SECONDARY_ACTION,
  ...COMMENT_CONTENT,
  ...UNLIKE_CONTENT,
  ...CLEAR_FEED,
};
