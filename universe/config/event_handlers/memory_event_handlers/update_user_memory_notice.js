const User = require("../../../models/user");

const update_user_memory_notice = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
   await User.updateMany(
      { _id: { $in: data.validPeopleTags } },
      { $push: { unreadNotice: data.notice } }
    );
  } catch (error) {
    console.log(error);
    console.log("📩 Failed to process update user memory notice topic");
  }
};

module.exports = { update_user_memory_notice };
