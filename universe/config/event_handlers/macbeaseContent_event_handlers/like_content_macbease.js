const User = require("../../../models/user");

const like_content_macbease = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const userWhoLiked = await User.findById(data.userId, {
      likedContents: 1,
    });
    const userAlreadyLiked = userWhoLiked.likedContents.some(
      (item) => item.contentId.toString() === data.contentId
    );
    if (!userAlreadyLiked) {
      userWhoLiked.likedContents.push({
        contentId: data.contentId,
        type: data.type,
      });
    }
    await userWhoLiked.save();
  } catch (error) {
    console.log(error);
    console.log("📩 Failed to process like macbease content topic");
  }
};

module.exports = { like_content_macbease };
