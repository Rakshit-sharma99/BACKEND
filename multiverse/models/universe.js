const mongoose = require("mongoose");

const universeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide the name of the universe."],
    },
    callSign: {
      type: String,
      required: [true, "Please provide the call sign of the universe."],
    },
    location: {
      type: String,
      required: [true, "Please provide the location of the universe."],
    },
    logo: {
      type: String,
      required: [true, "Please provide the logo of the universe."], // typo fixed
    },
    rank: {
      type: Number,
    },
    traffic: {
      type: Number,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Universe", universeSchema);
