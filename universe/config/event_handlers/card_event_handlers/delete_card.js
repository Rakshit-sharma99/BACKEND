const User = require("../../../models/user");
const mongoose = require("mongoose");

const delete_card = async (messageValue) => {
  try {
    const { userId, cardId } = JSON.parse(messageValue);

    if (!userId || !cardId) {
      console.warn("Missing userId or cardId in messageValue:", messageValue);
      return;
    }

    if (
      !mongoose.Types.ObjectId.isValid(userId) ||
      !mongoose.Types.ObjectId.isValid(cardId)
    ) {
      console.warn("Invalid ObjectId format:", { userId, cardId });
      return;
    }

    const user = await User.findById(userId).select("cards");

    if (!user) {
      console.warn(`No user found for ID: ${userId}`);
      return;
    }

    user.cards = user.cards.filter((id) => id.toString() !== cardId);

    await user.save();
  } catch (error) {
    console.error("❌ Failed to process delete_card:", error);
  }
};

module.exports = { delete_card };
