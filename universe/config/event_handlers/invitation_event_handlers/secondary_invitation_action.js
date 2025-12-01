const {secondaryInvitationActions} = require("../../../controllers/utils");

const secondary_invitation_action = async (messageValue) => {
  try {
    const { sentBy,sentTo,pingLevel,receiverEmail,senderEmail,receiverNotification,senderNotification,sentByModal,sentToModal } = JSON.parse(messageValue);

    await secondaryInvitationActions({sentBy,sentTo,sentByModal,sentToModal,pingLevel,senderNotification,receiverNotification,senderEmail,receiverEmail});

  } catch (error) {
    console.error("❌ Failed to process secondary invitation action topic:", error);
  }
};

module.exports = { secondary_invitation_action };
