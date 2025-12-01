const mongoose = require("mongoose");
const { Types } = mongoose;

/**
 * @typedef {Object} UPDATE_CLUB_PAYLOAD
 * @property {Types.ObjectId[]} newBadgeIds
 * @property {string} organisationId
 */

const UPDATE_CLUB = {
  UPDATE_CLUB: {
    topicSuffix: "_update_club",

    validate: (data) => {
        if (!Array.isArray(data.newBadgeIds) || !data.newBadgeIds.every(id => Types.ObjectId.isValid(id))) {
          throw new Error("newBadgeIds is required and must be an array of valid ObjectId instances");
        }

        if (typeof data.organisationId !== "string") {
          throw new Error("organisationId is required and must be a string");
        }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};


/**
 * @typedef {Object} UPDATE_COMMUNITY_PAYLOAD
 * @property {Types.ObjectId[]} newBadgeIds
 * @property {string} organisationId
 */


const UPDATE_COMMUNITY = {
  UPDATE_COMMUNITY: {
    topicSuffix: "_update_community",

    validate: (data) => {
        if (!Array.isArray(data.newBadgeIds) || !data.newBadgeIds.every(id => Types.ObjectId.isValid(id))) {
          throw new Error("newBadgeIds is required and must be an array of valid ObjectId instances");
        }

        if (typeof data.organisationId !== "string") {
          throw new Error("organisationId is required and must be a string");
        }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} UPDATE_USER_PAYLOAD
 * @property {Types.ObjectId[]} ids
 */

const UPDATE_USER = {
  UPDATE_USER: {
    topicSuffix: "_update_user",

    validate: (data) => {
        if (!Array.isArray(data.ids) || !data.newBadgeIds.every(id => Types.ObjectId.isValid(id))) {
          throw new Error("newBadgeIds is required and must be an array of valid ObjectId instances");
        }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...UPDATE_CLUB,
  ...UPDATE_COMMUNITY,
  ...UPDATE_USER
};
