const User = require("../../../models/user");

const unlike_card = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);

    const userWhoLiked = await User.findById(data.userId, {
      likedCards: 1,
    });

    if (!userWhoLiked) {
      console.log("User not found for unlike operation.");
      return;
    }

    userWhoLiked.likedCards = userWhoLiked.likedCards.filter(
      (item) => item.toString() !== data.cardId
    );

    await userWhoLiked.save();
  } catch (error) {
    console.error(error);
    console.log("📩 Failed to process unlike card topic");
  }
};

module.exports = { unlike_card };
