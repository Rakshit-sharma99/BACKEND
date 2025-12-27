const mongoose = require("mongoose");

const ticketSchema = new mongoose.Schema(
  {
    boughtBy: {
      type: mongoose.Types.ObjectId,
      ref: "User",
      required: true,
    },
    eventId: {
      type: mongoose.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    paymentId: {
      type: String,
    },
    amtPaid: {
      type: Number,
      required: true,
    },
    status: {
      type: String,
      enum: ["redeemed", "active", "refunded", "expired"],
      default: "active",
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
    reviewMsg: {
      type: String,
      trim: true,
    },
    reviewUrls: {
      type: String,
      trim: true,
    },
    reviewStars: {
      type: Number,
      min: 1,
      max: 5,
    },
    type: {
      type: String,
    },
    reviewLiked: {
      type: Boolean,
      default: false,
    },
    rsvp: [
      {
        type: mongoose.Types.ObjectId,
        ref: "Itinerary",
      },
    ],
    checkPoints: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Itinerary",
      default: [],
    },
    ],
    extraFieldsData: {
      type: Object,
    },
    refundRequested: {
      type: Boolean,
      default: false,
    },
    refundStatus: {
      type: Number,
      enum: [0, 1], //0-> not initiated  1->inititated
    },
    refundId: {
      type: String,
    },
    couponId: {
      type: mongoose.Types.ObjectId,
      ref: "Coupon",
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Ticket", ticketSchema);
