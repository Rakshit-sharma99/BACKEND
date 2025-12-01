const User = require("../../../models/user");

const update_macbeasecontent_contribution = async (messageValue) => {
  try {
    const { userId, contentId } = JSON.parse(messageValue);

    if (!userId || !contentId) {
      console.warn("⚠️  Both userId and contentId are required.");
      return;
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $push: {
          macbeaseContentContribution: {
            $each: [contentId],
            $position: 0,
          },
        },
      },
      { new: true }
    );

    if (!updatedUser) {
      console.warn("⚠️  User not found.");
      return;
    }

  } catch (err) {
    console.error("❌ Failed to process content-added-to-project message:", err);
  }
};

module.exports = { update_macbeasecontent_contribution };
