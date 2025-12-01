const Invitation = require("../../../models/invitation");

const update_invitation = async (messageValue) => {
  try {
    const payload = JSON.parse(messageValue);

    const { invitationId, updatedFields } = payload;

    await Invitation.findByIdAndUpdate(invitationId, {
      $set: updatedFields,
    });

    console.log("update_invitation kafka event success");
  } catch (err) {
    console.error("❌ Failed to process update_invitation message:", err.message);
  }
};

module.exports = {update_invitation};
