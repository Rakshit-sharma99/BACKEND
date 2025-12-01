const User = require("../../../models/user");
const mongoose = require("mongoose");

const like_card = async (messageValue) => {
  try {
    const { cardId, userId } = JSON.parse(messageValue);

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

    const user = await User.findById(userId, {
      likedCards: 1,
    });

    if (!user) {
      console.warn("User not found:", { userId });
      return;
    }

    // Avoid duplicate likes
    if (!user.likedCards.includes(cardId)) {
      user.likedCards.push(cardId);
      await user.save();
    }
  } catch (error) {
    console.error("❌ Failed to process like_card:", error);
  }
};

module.exports = { like_card };
