const User = require("../../../models/user");
const mongoose = require("mongoose");

const delete_resource = async (messageValue) => {
  try {
    const { userId, resourceId } = JSON.parse(messageValue);

    if (!userId || !resourceId) {
      console.warn("❗ Missing userId or resourceId in message:", messageValue);
      return;
    }

    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(resourceId)
    ) {
      console.warn("❗ Invalid ObjectId(s):", { userId, resourceId });
      return;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $pull: { resources: new mongoose.Types.ObjectId(resourceId) } },
      { new: true }
    );

    if (!updatedUser) {
      console.warn(`No user found with ID: ${userId}`);
    }
  } catch (error) {
    console.error("❌ Failed to process delete_resource:", error);
  }
};

module.exports = { delete_resource };
