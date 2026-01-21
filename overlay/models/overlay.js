const mongoose = require("mongoose");

const OverlaySchema = new mongoose.Schema(
  {
    title: {
      type: String,
    },
    aspectRatio: {
      type: Number, // e.g., 16/9 or 9/16
    },
    cover: {
      type: String, // background image URL
      required: true,
    },
    buttons: [
      {
        label: {
          type: String,
          required: true,
        },
        buttonStyle: {
          type: Map,
          of: String, // flexible, key-value CSS-like props
        },
        textStyle: {
          type: Map,
          of: String,
        },
        position: {
          x: { type: Number, required: true },
          y: { type: Number, required: true },
        },
        animationType: {
          type: String,
          enum: ["fade", "slideUp", "slideRight", "breathing", "rotate"],
          default: "breathing",
        },
        action: {
          type: {
            type: String,
            enum: ["navigation", "deepLink", "webLink", "dismiss"],
            required: true,
          },
          url: String, // for deepLink/webLink
          payload: Object, // extra data (like navigation params)
        },
      },
    ],
    stats: [
      {
        _id: false,
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        viewedAt: { type: Date, default: Date.now },
        actionType: { type: String },
      },
    ],
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
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Overlay", OverlaySchema);
