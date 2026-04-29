const mongoose = require("mongoose");

const universeSchema = new mongoose.Schema(
  {
    name: String,
    location: String,
    logo: String,
    callSign: String,
    logoKey: String,

    lat: {
      type: Number,
      default: 0,
      set: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0),
    },

    lng: {
      type: Number,
      default: 0,
      set: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0),
    },
  },
  { _id: false },
);

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
    ticketPrice : {
      type : Number,
    },
    platformFee : {
      type : Number,
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
    seatId: {
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
    uid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
    },

    universeMetaData: universeSchema,
  },
  { timestamps: true }
);

ticketSchema.index({ eventId: 1, seatId: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Ticket", ticketSchema);
