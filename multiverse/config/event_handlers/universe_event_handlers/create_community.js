const mongoose = require("mongoose");
const Community = require("../../../models/community");

const create_community = async (messageValue) => {
  try {
    const payload = JSON.parse(messageValue);

    const newCommunity = new Community({
      _id: new mongoose.Types.ObjectId(payload._id),
      title:payload.title,
      cover:payload.cover,
      secondaryCover:payload.secondaryCover,
      label:payload.label,
      createdOn:payload.createdOn,
      tag:payload.tag,
      hiddenTags:payload.hiddenTags,
      uid: payload.uid,
      universeMetaData: payload.universeMetaData,
    });

    await newCommunity.save();

    console.log(" create_community kafka event success:");
  } catch (err) {
    console.error("❌ Failed to process create_community message:", err);
  }
};

module.exports = { create_community };
