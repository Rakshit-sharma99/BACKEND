const { default: mongoose } = require("mongoose");
const User = require("../../../models/user");

const update_user_pinned_memory = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);

    const {id,memoryId,operation} = data;

    if(operation==="add"){
        await User.findByIdAndUpdate(
        id,
        { $push: { pinnedMemories: memoryId } },
        { new: true }
      );
    }
    if (operation === "remove") {
        await User.findByIdAndUpdate(
        id,
        { $pull: { pinnedMemories: memoryId } },
        { new: true }
      );
    }
  } catch (error) {
    console.log(error);
    console.log("📩 Failed to process update user pinned memory topic");
  }
};

module.exports = { update_user_pinned_memory };
