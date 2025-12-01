const User = require("../../../models/user");

const allot_chatroom = async (messageValue) => {
  try {
    const { userIds,chatDoc } = JSON.parse(messageValue);

        await User.updateMany(
        {_id: { $in: userIds}},
        {$addToSet: {chatRooms: chatDoc}}
      );

  } catch (error) {
    console.error("❌ Failed to process allot chatroom topic:", error);
  }
};

module.exports = { allot_chatroom };
