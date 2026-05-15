const mongoose = require("mongoose");

const awardInstanceSchema = new mongoose.Schema(
  {
    awardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Award",
      required: true,
    },

    dispatchedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    dispatcherType: {
      type: String,
      enum: ["club", "community", "macbease"],
      required: true,
    },

    previewURl: {
      type: String,
    },

    formData: {
      type: Object,
      default: {},
    },

    dispatcherMetaData: {
      name: { type: String },
      userId: { type: String },
      orgId: { type: String },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("AwardInstance", awardInstanceSchema);
