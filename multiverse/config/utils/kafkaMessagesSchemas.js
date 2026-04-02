/**
 * @typedef {Object} UNIVERSE_CREATED
 * @property {string} chapterLeaderId
 * @property {string} universeId
 */

const UNIVERSE_CREATED = {
  UNIVERSE_CREATED: {
    topicSuffix: "_universe_created",

    validate: (data) => {

      if (typeof data.chapterLeaderId !== "string") {
        throw new Error("'chapterLeaderId' must be a string");
      }

      if (typeof data.universeId !== "string") {
        throw new Error("'universeId' must be a string");
      }

    },

    build: (payload) => ({
      value: JSON.stringify(payload),
    }),
  },
};

module.exports = {
  ...UNIVERSE_CREATED,
}
