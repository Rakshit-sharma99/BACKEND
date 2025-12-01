const mongoose = require("mongoose");
const { Types } = mongoose;

/**
 * @typedef {Object} CREATE_OFFER_PAYLOAD
 * @property {String} offerId
 * @property {String} jobTime
 * @property {String[]} visibleTo
 * @property {Boolean} dispatchCustomNotification
 * @property {Object} notificationMetaData
 */

const CREATE_OFFER = {
  CREATE_OFFER: {
    topicSuffix: "_create_offer",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be a non-null object.");
      }

      if (typeof data.offerId !== "string" || data.offerId.trim() === "") {
        throw new Error("'offerId' must be a non-empty string.");
      }

      if (typeof data.jobTime !== "object") {
        throw new Error("'jobTime' must be a date object.");
      }

      if (
        !Array.isArray(data.visibleTo) ||
        data.visibleTo.length === 0 ||
        !data.visibleTo.every((id) => typeof id === "string" && id.trim() !== "")
      ) {
        throw new Error(
          "'visibleTo' must be a non-empty array of non-empty strings."
        );
      }

    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

/**
 * @typedef {Object} UPDATE_USER_IP_PAYLOAD
 * @property {String} userId
 * @property {Number} ipChange
 * @property {String} c_source
 * @property {String} d_source
 * @property {String} c_ref
 * @property {String} d_ref
 * @property {String} description
*/

const UPDATE_USER_IP = {
  UPDATE_USER_IP: {
    topicSuffix: "_update_user_ip",

    validate: (data) => {
      if (!data || typeof data !== "object") {
        throw new Error("Payload must be a non-null object.");
      }

      if (typeof data.userId !== "string" || data.userId.trim() === "") {
        throw new Error("'userId' must be a non-empty string.");
      }

      if (typeof data.ipChange !== "number") {
        throw new Error("'ipChange' must be a number.");
      }

      if (typeof data.c_source !== "string" || data.c_source.trim() === "") {
        throw new Error("'c_source' must be a non-empty string.");
      }

      if (typeof data.d_source !== "string" || data.d_source.trim() === "") {
        throw new Error("'d_source' must be a non-empty string.");
      }
    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};


module.exports = {
  ...CREATE_OFFER,
  ...UPDATE_USER_IP
}
