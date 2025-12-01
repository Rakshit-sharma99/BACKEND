const schedule = require("node-schedule");
const {pingUsers} = require("../../../controllers/utils");

const create_project = async (messageValue) => {
  try {
    const { projectId,title } = JSON.parse(messageValue);

    const scheduleTime = new Date(Date.now() + 3000);
      schedule.scheduleJob(
        `projectCreated_${projectId}`,
        scheduleTime,
        async () => {
          const notification = {
            title: '🚀 New Project Alert!',
            body: `Great news! A new project titled "${title}" is live. Don't miss this opportunity—apply now before the deadline!`,
            img1: 'public/Macbease/Macbease-01.png',
            img2: '',
            key: 'read',
            url: 'https://macbease.com/app/projects',
          };
          const email = {
            name: 'Content Creator',
            intro: `We are thrilled to announce that a new project titled "${title}" is now live!`,
            outro:
              'Visit the link above to view the project details and get started:',
            subject: '✨ A New Project Awaits You!',
            action: {
              instructions: 'Click on the button below to go to the project:',
              text: 'View Project',
              url: 'https://macbease.com/app/projects',
            },
          };
          await pingUsers({
            role: 'Creator',
            pingLevel: 2,
            notification,
            email,
          });
        }
      );

  } catch (error) {
    console.error("❌ Failed to process create project topic:", error);
  }
};

module.exports = { create_project };
