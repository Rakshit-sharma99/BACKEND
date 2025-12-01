const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    ip: {
      type: Number,
      required: true,
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    availedBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        couponId: { type: String, required: false },
        availedAt: { type: Date, default: Date.now },
      },
    ],
    available: [{ type: String }],
    status: {
      type: Number,
      enum: [0, 1],
      default: 1,
    },
    metaData: {
      url: { type: String, required: false },
      store: { type: String, required: false },
    },
    action: {
      endPoint: { type: String, required: false },
      body: { type: Object, required: false },
      query: { type: String, required: false },
      reqType: { type: String, required: false },
    },
    navigation: {
      to: { type: String, required: false },
      params: { type: Object, required: false },
    },
    visibleTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    notificationMetaData: {
      noticeTitle: { type: String },
      noticeBody: { type: String },
      noticeImage: { type: String },
    },
    uid: {
    type: String,
  },
  universeMetaData: {
    name: String,
    location: String,
    logo: String,
    callSign: String,
  }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Offer", offerSchema);
