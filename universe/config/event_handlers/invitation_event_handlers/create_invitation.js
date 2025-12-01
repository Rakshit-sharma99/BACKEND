const User = require("../../../models/user");
const schedule = require("node-schedule");
const {pingAdmins} = require("../../../controllers/utils");

const create_invitation = async (messageValue) => {
  try {
    const { invitationId,sentTo,sendBy,img1,img2,type,action,subject,text } = JSON.parse(messageValue);

    if (type === "Content Team Application") {
      const scheduleTime = new Date(Date.now() + 3000);
      schedule.scheduleJob(
        `contentCreatorApplication_${invitationId}`,
        scheduleTime,
        async () => {
          await pingAdmins({
            role: "Content Team",
            pingLevel: 2,
            notification: {
              title: "Hello Macbease Content Team!",
              body: "We have got new application for content creator!",
              img1,
              img2,
              key: "invitation",
              action: "invitation",
              params: {
                invitationId,
                action,
              },
            },
            email: {
              intro:
                "We have got a new application for Content Creator post. Please review the application.",
              outro: "Our team is getting bigger and stronger.",
              subject: "Content Creator Application",
            },
          });
        }
      );
    } else {
      let receiver = await User.findById(sentTo, { unreadNotice: 1 });
      const notice = {
        value: subject ? subject : `Proposal- ${text}`,
        img1,
        img2,
        key: "invitation",
        action: "invitation",
        params: {
          invitationId,
          action,
        },
        time: new Date(),
        uid: `${new Date()}/${receiver._id}/${sendBy}`,
      };
      receiver.unreadNotice = [notice, ...receiver.unreadNotice];
      receiver.save();
    }

  } catch (error) {
    console.error("❌ Failed to process create invitation topic:", error);
  }
};

module.exports = { create_invitation };
