/**
 * @typedef {Object} ADD_CARD_PAYLOAD
 * @property {string} userId
 * @property {string} cardId
 */

const ADD_CARD = {
  ADD_CARD: {
    topicSuffix: "_add_card",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }

      if (typeof data.cardId !== "string") {
        throw new Error("'cardId' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} CardUserMetaData
 * @property {string} name
 * @property {string} image
 * @property {string} course
 * @property {string} pushToken
 */

/**
 * @typedef {Object} CardUniverseMetaData
 * @property {string} name
 * @property {string} location
 * @property {string} logo
 * @property {string} callSign
 */

/**
 * @typedef {Object} Card
 * @property {string} _id
 * @property {string} value
 * @property {string} creator
 * @property {string[]} tags
 * @property {string[]} [likedBy]
 * @property {number[]} [vector]
 * @property {CardUserMetaData} userMetaData
 * @property {string} uid
 * @property {CardUniverseMetaData} universeMetaData
 * @property {string} [createdAt]
 * @property {string} [updatedAt]
 */

/**
 * @typedef {Object} UPDATE_CARD_FEED_PAYLOAD
 * @property {Card} card
 */

const UPDATE_CARD_FEED = {
  UPDATE_CARD_FEED: {
    topicSuffix: "_update_card_feed",

    validate: (data) => {
      if (!data.card || typeof data.card !== "object") {
        throw new Error("'card' must be sent in the payload");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} DELETE_CARD_PAYLOAD
 * @property {string} userId
 * @property {string} cardId
 */

const DELETE_CARD = {
  DELETE_CARD: {
    topicSuffix: "_delete_card",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("'userId' must be a string");
      }

      if (typeof data.cardId !== "string") {
        throw new Error("'cardId' must be a string");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} LIKE_CARD_PAYLOAD
 * @property {string} cardId
 * @property {string} userId
 */

const LIKE_CARD = {
  LIKE_CARD: {
    topicSuffix: "_like_card",

    validate: (data) => {
      if (typeof data.cardId !== "string") {
        throw new Error("contentId required in payload");
      }
      if (typeof data.userId !== "string") {
        throw new Error("userId required in payload");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} LIKE_CARD_SECONDARY_ACTION_PAYLOAD
 * @property {string} cardId
 * @property {string} creatorId
 * @property {{ name: string, image: string,_id: string, pushToken:string ,uid: string, universeMetaData: object }} userInfo
 * @property {{ _id: ObjectId,... }} cardInfo
 */

const LIKE_CARD_SECONDARY_ACTION = {
  LIKE_CARD_SECONDARY_ACTION: {
    topicSuffix: "_like_card_secondary_action",

    validate: (data) => {
      if (typeof data.cardId !== "string") {
        throw new Error("cardId required in payload");
      }
      if (typeof data.creatorId !== "string") {
        throw new Error("creatorId required in payload");
      }
      if (
        !data.userInfo ||
        typeof data.userInfo.name !== "string" ||
        typeof data.userInfo.image !== "string" ||
        typeof data.userInfo._id !== "string" ||
        typeof data.userInfo.pushToken !== "string" ||
        typeof data.userInfo.uid !== "string" ||
        typeof data.userInfo.universeMetaData !== "object"
      ) {
        throw new Error(
          "'userInfo' must contain 'name','image','_id','pushToken','uid as strings along with universeMetaData"
        );
      }
      if (!data.cardInfo) {
        throw new Error("cardInfo is required");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} UNLIKE_CARD_PAYLOAD
 * @property {string} userId
 * @property {string} cardId
 */

const UNLIKE_CARD = {
  UNLIKE_CARD: {
    topicSuffix: "_unlike_card",

    validate: (data) => {
      if (typeof data.userId !== "string") {
        throw new Error("userId required in payload");
      }
      if (typeof data.cardId !== "string") {
        throw new Error("cardId required in payload");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...ADD_CARD,
  ...UPDATE_CARD_FEED,
  ...DELETE_CARD,
  ...LIKE_CARD,
  ...LIKE_CARD_SECONDARY_ACTION,
  ...UNLIKE_CARD,
};
