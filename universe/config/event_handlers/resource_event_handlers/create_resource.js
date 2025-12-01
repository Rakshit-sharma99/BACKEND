const User = require("../../../models/user");
const mongoose = require("mongoose");

const create_resource = async (messageValue) => {
  try {
    const { userId, resourceId } = JSON.parse(messageValue);

    if (!userId || !resourceId) {
      console.warn("Missing userId or cardId in messageValue:", messageValue);
      return;
    }

    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(resourceId)
    ) {
      console.warn("Invalid ObjectId format:", { userId, resourceId });
      return;
    }

    const user = await User.findById(userId).select("resources");

    if (!user) {
      console.warn(`No user found for ID: ${userId}`);
      return;
    }

    // Prevent duplicate card entries
    const resourceObjectId = new mongoose.Types.ObjectId(resourceId);
    if (user.resources.some((c) => c.equals(resourceObjectId))) {
      console.log(`Resource ${resourceId} already exists in user's resources`);
      return;
    }

    user.resources.push(resourceObjectId);
    await user.save();
  } catch (error) {
    console.error("❌ Failed to process create_resource:", error);
  }
};

module.exports = { create_resource };
