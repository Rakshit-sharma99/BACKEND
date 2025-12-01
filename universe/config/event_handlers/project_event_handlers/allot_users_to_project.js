const schedule = require("node-schedule");
const {pingUsers, allotProjectChatroom} = require("../../../controllers/utils");

const allot_users_to_project = async (messageValue) => {
  try {
    const { projectId,title,userIds } = JSON.parse(messageValue);

    const scheduleTime = new Date(Date.now() + 3000);
      schedule.scheduleJob(
        `projectAlloted_${projectId}`,
        scheduleTime,
        async () => {
          const notification = {
            title: '🎉 Congratulations! Project Allotted!',
            body: `You’ve been selected as part of the team for the project "${title}". Check it out now!`,
            img1: 'public/Macbease/Macbease-01.png',
            img2: '',
            key: 'read',
            url: 'https://macbease.com/app/projects',
          };

          const email = {
            name: 'Dear Content Creator',
            intro: `We are thrilled to inform you that you have been selected as part of the team for the project **"${title}"**!`,
            body: `To streamline communication, a group chat for this project has been created and added to your chatrooms. Please ensure you check your messages regularly for updates and collaboration details. Additionally, further instructions have been sent to your email.`,
            outro: `Click the button below to view the project details and get started on this exciting journey. We can't wait to see your contributions!`,
            subject: '🎉 You have Been Selected for the Project!',
            action: {
              instructions: 'Click the button below to visit the project page:',
              text: 'View Project',
              url: 'https://macbease.com/app/projects',
            },
          };
          await pingUsers({
            ids: userIds,
            pingLevel: 2,
            notification,
            email,
          });
        }
      );

      const chatRoomId = `project${projectId}`;
      await allotProjectChatroom(userIds,chatRoomId);

  } catch (error) {
    console.error("❌ Failed to process allot users to project topic:", error);
  }
};

module.exports = { allot_users_to_project };
