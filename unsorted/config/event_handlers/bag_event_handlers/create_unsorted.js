const Unsorted = require("../../../models/unsorted");

const create_unsorted = async (messageValue) => {
  try {
    const { keyWord } = JSON.parse(messageValue);
    
    const create = await Unsorted.create({ word: keyWord });
  } catch (error) {
    console.error("❌ Failed to process create unsorted topic:", error);
  }
};

module.exports = { create_unsorted };
