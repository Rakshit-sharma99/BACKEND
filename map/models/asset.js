const mongoose = require("mongoose");

const assetSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
    },
    type: {
      type: String,
      enum: ["svg", "img", "lottie", "illustration", "gif"],
      required: true,
    },
    tag: {
      type: String,
    },
    availability: {
      type: String,
      enum: ["free", "paid"],
      required: true,
    },
    url: {
      type: String,
    },
    rawData: {
      type: mongoose.Schema.Types.Mixed,
    },
    price: {
      type: Number,
      default: 0,
      min: 0,
    },
    contributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Asset", assetSchema);
