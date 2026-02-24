const mongoose = require("mongoose");

const cardSchema = new mongoose.Schema(
  {
    value: {
      type: String,
      required: true,
      trim: true,
    },

    title: {
      type: String,
      trim: true,
    },

    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    tags: {
      type: [String],
      default: [],
    },

    likedBy: {
      type: [String],
      default: [],
    },

    vector: {
      type: [Number],
      default: [],
    },

    userMetaData: {
      type: new mongoose.Schema(
        {
          name: String,
          image: String,
          course: String,
          pushToken: String,
        },
        { _id: false }
      ),
    },

    uid: {
      type: String,
      trim: true,
    },

    universeMetaData: {
      name: { type: String },
      location: { type: String },
      logo: { type: String },
      callSign: { type: String },
      logoKey: { type: String },
      lat: { type: Number },
      lng: { type: Number }
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Card", cardSchema);
