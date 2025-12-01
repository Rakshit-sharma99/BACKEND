const MacbeaseContent = require("../../../models/macbeaseContent");

const update_macbease_content = async (messageValue) => {
  try {
    const payload = JSON.parse(messageValue);

    const { contentId, updatedFields } = payload;

    await MacbeaseContent.findByIdAndUpdate(contentId, {
      $set: updatedFields,
    });

    console.log("update_macbease_content kafka event success");
  } catch (err) {
    console.error("❌ Failed to process update_macbease_content message:", err.message);
  }
};

module.exports = {update_macbease_content};
