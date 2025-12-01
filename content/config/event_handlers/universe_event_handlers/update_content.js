const Content = require("../../../models/content");

const update_content = async (messageValue) => {
  try {
    const payload = JSON.parse(messageValue);

    const { contentId, updatedFields } = payload;

    await Content.findByIdAndUpdate(contentId, {
      $set: updatedFields,
    });

    console.log("update_content kafka event success");
  } catch (err) {
    console.error("❌ Failed to process update_content message:", err.message);
  }
};

module.exports = {update_content};
