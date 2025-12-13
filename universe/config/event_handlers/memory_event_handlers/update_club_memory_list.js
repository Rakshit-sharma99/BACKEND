const { default: mongoose } = require("mongoose");
const Club = require("../../../models/user");

const update_club_memory_list = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const {id,memoryId,operation} = data;
    const memoryObjectId = new mongoose.Types.ObjectId(memoryId)
    if(operation==="add"){
      await Club.findByIdAndUpdate(
          id,
          { $addToSet: { memoryRequests: memoryObjectId } },
          { new: true }
        );
    }
     if (operation === "remove") {
        await Club.findByIdAndUpdate(
          id,
          { $pull: { memoryRequests: memoryId } }
        );
    }
  } catch (error) {
    console.log(error);
    console.log("📩 Failed to process update club memory list topic");
  }
};

module.exports = { update_club_memory_list };
