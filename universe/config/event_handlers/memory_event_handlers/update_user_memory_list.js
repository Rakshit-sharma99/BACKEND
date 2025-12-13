const { default: mongoose } = require("mongoose");
const User = require("../../../models/user");

const update_user_memory_list = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);

    const {id,memoryId,operation} = data;
    const memoryObjectId = new mongoose.Types.ObjectId(memoryId)

    if(operation==="add"){
        await User.findByIdAndUpdate(
            id,
            { $addToSet: { memoryRequests: memoryObjectId } },
            { new: true }
          );
    }
    if (operation === "remove") {
        await User.findByIdAndUpdate(
            id,
            { $pull: { memoryRequests: memoryObjectId } }
        );
    }
  } catch (error) {
    console.log(error);
    console.log("📩 Failed to process update user memory list topic");
  }
};

module.exports = { update_user_memory_list };
