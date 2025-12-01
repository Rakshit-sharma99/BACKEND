const User = require("../../models/user");

const unlike_content = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);

    const userWhoLiked = await User.findById(data.userId, {
      likedContents: 1,
    });

    if (!userWhoLiked) {
      console.log("User not found for unlike operation.");
      return;
    }

    userWhoLiked.likedContents = userWhoLiked.likedContents.filter(
      (item) => item.contentId !== data.contentId
    );

    await userWhoLiked.save();
  } catch (error) {
    console.error(error);
    console.log("📩 Failed to process unlike content topic");
  }
};

module.exports = { unlike_content };
