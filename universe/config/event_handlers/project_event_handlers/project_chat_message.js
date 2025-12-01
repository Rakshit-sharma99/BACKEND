const { scheduleNotification2} = require("../../../controllers/utils");
const User = require("../../../models/user");

const project_chat_message = async (messageValue) => {
  try {
    const { projectId,title,userIds,message,sender } = JSON.parse(messageValue);

        const users = await User.find({ _id: { $in: userIds } },{pushToken:1,chatRooms:1});

    await User.updateMany(
        { _id: { $in: userIds }, "chatRooms.doc_id": `project${projectId}` },
        {
            $set: { "chatRooms.$.state": "unread" },
        },
        {
            arrayFilters: [{ "chatRoom.doc_id": `project${projectId}` }],
        }
        );

        const tokens = users.map(item => item.pushToken);
        scheduleNotification2({
        pushToken: tokens,
        title: `${sender} messaged in ${title}.`,
        body: `${message.substring(0, 50)}...`,
        url: `https://macbease.com/app/projectMessage/${projectId}`,
        });
  } catch (error) {
    console.error("❌ Failed to process project chat message topic:", error);
  }
};

module.exports = { project_chat_message };
