const Admin = require("../../../models/admin");

const delete_content_macbease = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { adminId, contentUrl } = data;

    if (!adminId || !contentUrl) {
      console.error("❌ Invalid Kafka payload: adminId and contentUrl are required.", data);
      return;
    }

    const admin = await Admin.findById(adminId);
    if (!admin) {
      console.error(`❌ Admin with ID ${adminId} not found.`);
      return;
    }

    admin.thrashUrls.push(contentUrl);
    await admin.save();
  } catch (error) {
    console.error(error);
     console.error("📩 Failed to process delete macbease content topic");
  }
};

module.exports = { delete_content_macbease };
