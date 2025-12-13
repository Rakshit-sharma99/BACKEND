const User = require("../../../models/user");

const update_memory_list = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    await User.findByIdAndUpdate(
        data.id,
        { $addToSet: { memoryList: { $each: data.validPeopleTags } } },
        { new: true }
      );
  } catch (error) {
    console.log(error);
    console.log("📩 Failed to process update memory list topic");
  }
};

module.exports = { update_memory_list };
