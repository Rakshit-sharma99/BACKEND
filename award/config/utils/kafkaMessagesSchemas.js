/**
 * @typedef {Object} CREATE_MEMORY_PAYLOAD
 * @property {Object} memoryData
 */

const CREATE_MEMORY = {
  CREATE_MEMORY: {
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

module.exports = {
  ...CREATE_MEMORY,
}
