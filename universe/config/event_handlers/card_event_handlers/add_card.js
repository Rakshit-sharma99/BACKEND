const User = require("../../../models/user");
const mongoose = require("mongoose");

const add_card = async (messageValue) => {
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

    // Prevent duplicate card entries
    const cardObjectId = new mongoose.Types.ObjectId(cardId);
    if (user.cards.some((c) => c.equals(cardObjectId))) {
      console.log(`Card ${cardId} already exists in user's cards`);
      return;
    }

    user.cards.push(cardObjectId);
    await user.save();
  } catch (error) {
    console.error("❌ Failed to process add_card:", error);
  }
};

module.exports = { add_card };
