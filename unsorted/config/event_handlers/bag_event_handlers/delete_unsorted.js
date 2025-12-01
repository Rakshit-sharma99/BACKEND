const Unsorted = require("../../../models/unsorted");

const delete_unsorted = async (messageValue) => {
  try {
    const { unsorted } = JSON.parse(messageValue);
    
    const del = await Unsorted.findOneAndDelete({
      word: new RegExp(unsorted, "i"),
    });
  } catch (error) {
    console.error("❌ Failed to process delete unsorted topic:", error);
  }
};

module.exports = { delete_unsorted };
