/**
 * @typedef {Object} UNIVERSE_CREATED
 * @property {string} chapterLeaderId
 * @property {string} universeId
 * @property {Object} universeMetaData
 * @property {string} universeMetaData.name
 * @property {string} universeMetaData.callSign
 * @property {string} universeMetaData.logo
 * @property {string} universeMetaData.logoKey
 * @property {string} universeMetaData.location
 * @property {Number} universeMetaData.lat
 * @property {Number} universeMetaData.lng
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

      if (typeof data.universeMetaData !== "object") {
        throw new Error("'universeMetaData' must be an object");
      }

      if (typeof data.universeMetaData.name !== "string") {
        throw new Error("'universeMetaData.name' must be a string");
      }

      if (typeof data.universeMetaData.callSign !== "string") {
        throw new Error("'universeMetaData.callSign' must be a string");
      }

      if (typeof data.universeMetaData.logo !== "string") {
        throw new Error("'universeMetaData.logo' must be a string");
      }

      if (typeof data.universeMetaData.logoKey !== "string") {
        throw new Error("'universeMetaData.logoKey' must be a string");
      }

      if (typeof data.universeMetaData.location !== "string") {
        throw new Error("'universeMetaData.location' must be a string");
      }

      if (typeof data.universeMetaData.lat !== "number") {
        throw new Error("'universeMetaData.lat' must be a number");
      }

      if(typeof data.universeMetaData.lng !== "number" ){
        throw new Error("'universeMetaData.lng' must be a number");
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
