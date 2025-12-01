const User = require("../../../models/user");
const { getRelatedTags } = require("../../../controllers/commonControllers");

const update_card_feed = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { card } = data;

    if (!card) {
      console.warn("Missing card in messageValue:", messageValue);
      return;
    }

    if (!card.tags || !Array.isArray(card.tags) || card.tags.length === 0) {
      console.warn("Missing tags in card", messageValue);
      return;
    }

    const tags = await getRelatedTags(card.tags);
    if (!tags || tags.length === 0) return;

    const regexTags = tags.map((tag) => new RegExp(tag, "i"));

    const users = await User.aggregate([
      {
        $match: {
          interests: { $in: regexTags },
        },
      },
      {
        $project: { _id: 1 },
      },
    ]);

    const userIds = [...new Set(users.map((u) => u._id.toString()))];

    if (userIds.length === 0) return;

    const matchedUsers = await User.find(
      { _id: { $in: userIds } },
      { cardFeed: 1 }
    );

    const bulkOperations = matchedUsers.map((user) => {
      const previousCards = Array.isArray(user.cardFeed)
        ? user.cardFeed.slice(-6)
        : [];

      return {
        updateOne: {
          filter: { _id: user._id },
          update: {
            $set: {
              cardFeed: [card, ...previousCards],
            },
          },
        },
      };
    });

    if (bulkOperations.length > 0) {
      await User.bulkWrite(bulkOperations);
    }
  } catch (error) {
    console.error("❌ Failed to process update_card_feed:", error);
  }
};

module.exports = { update_card_feed };
