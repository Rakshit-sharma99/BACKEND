const User = require("../../models/user");

const clear_feed = async (messageValue) => {
  try {
    const { userId } = JSON.parse(messageValue);

    if (!userId) {
      console.warn("No userId provided in messageValue");
      return;
    }

    const user = await User.findById(userId, {
      feed: 1,
      eventFeed: 1,
    });

    if (!user) {
      console.warn(`User not found for ID: ${userId}`);
      return;
    }

    // Trim feeds safely
    user.feed = Array.isArray(user.feed) ? user.feed.slice(0, 12) : [];
    user.eventFeed = Array.isArray(user.eventFeed)
      ? user.eventFeed.slice(0, 3)
      : [];

    user.lastActive = new Date();

    await user.save();
  } catch (error) {
    console.error("❌ Failed to process clear feed topic:", error);
  }
};

module.exports = { clear_feed };
