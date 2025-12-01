const mongoose = require("mongoose");
const User = require("../../../models/user");

const create_user = async (messageValue) => {
  try {
    const payload = JSON.parse(messageValue);

    const newUser = new User({
      _id: new mongoose.Types.ObjectId(payload._id),
      profession: payload.profession,
      name: payload.name,
      reg: payload.reg,
      course: payload.course,
      field: payload.field,
      passoutYear: payload.passoutYear,
      level: payload.level,
      email: payload.email,
      image: payload.image,
      interests: payload.interests,
      uid: payload.uid,
      universeMetaData: payload.universeMetaData,
    });

    await newUser.save();

    console.log(" create_user kafka event success:");
  } catch (err) {
    console.error("❌ Failed to process create_user message:", err);
  }
};

module.exports = { create_user };
