const mongoose = require("mongoose");

const QuestSchema = new mongoose.Schema(
  {
    ip: {
      type: Number,
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    status: {
      type: Number,
      enum: [0, 1], // 0 = inactive, 1 = active
      default: 1,
    },
    completedBy: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    isRepeatable: {
      type: Boolean,
      default: false,
    },
    available: {
      type: Number,
      required: true,
      min: 0,
    },
    metaData: {
      url: {
        type: String,
      },
    },
    visibleTo: {
      type: [mongoose.Schema.Types.ObjectId],
      ref: "User",
      default: [],
    },
    mode: {
      type: String,
      required: true,
      enum: ["navigation", "modal", "onlyRead"],
    },
    payload: {
      type: Object,
    },
    uid: {
      type: String,
    },
    universeMetaData: {
      name: { type: String },
      location: { type: String },
      logo: { type: String },
      callSign: { type: String },
      logoKey: { type: String },
      lat: { type: Number },
      lng: { type: Number }
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Quest", QuestSchema);
