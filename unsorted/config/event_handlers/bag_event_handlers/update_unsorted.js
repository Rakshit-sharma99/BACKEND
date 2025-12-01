const Unsorted = require("../../../models/unsorted");

const update_unsorted = async (messageValue) => {
  try {
    const { keyWords,unsorted } = JSON.parse(messageValue);
    
    const abc = await Unsorted.findOneAndDelete({
      word: new RegExp(keyWords[0], "i"),
    });
    if (unsorted) {
      await Unsorted.create({ word: unsorted });
    }

  } catch (error) {
    console.error("❌ Failed to process update unsorted topic:", error);
  }
};

module.exports = { update_unsorted };
