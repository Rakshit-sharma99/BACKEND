const JoinLink = require("../../../models/joinLink");

const update_joinlink = async (messageValue) => {
  try {
    const payload = JSON.parse(messageValue);

    const { joinLinkId, userId } = payload;

    await JoinLink.findByIdAndUpdate(joinLinkId, {
       $addToSet: { usedBy: userId },
    });

    console.log("update_joinLink kafka event success");
  } catch (err) {
    console.error("❌ Failed to process update_joinLink message:", err.message);
  }
};

module.exports = {update_joinlink};
