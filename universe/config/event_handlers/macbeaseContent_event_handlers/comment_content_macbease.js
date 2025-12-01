const User = require("../../../models/user");

const comment_content_macbease = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);

    const requiredFields = ["cid", "contentId", "type", "userId"];
    for (const field of requiredFields) {
      if (!data[field]) {
        console.warn(`Missing field ${field} in comment_content_macbease payload`);
        return;
      }
    }

    const userWhoCommented = await User.findById(data.userId, {
      commentedContents: 1,
    });

    if (!userWhoCommented) {
      console.warn(`User with ID ${data.userId} not found.`);
      return;
    }

    userWhoCommented.commentedContents.unshift({
      cid: data.cid,
      contentId: data.contentId,
      type: data.type,
    });

    await userWhoCommented.save();
  } catch (error) {
    console.error("❌ Failed to process comment macbease content topic", error);
  }
};

module.exports = { comment_content_macbease };
