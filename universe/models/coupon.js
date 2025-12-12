const mongoose = require("mongoose");

const CouponSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true, // unique coupon code
      trim: true,
      uppercase: true, // store in uppercase for consistency
    },

    discountType: {
      type: String,
      enum: ["percentage", "flat"], // percentage or flat amount
      required: true,
    },

    discountValue: {
      type: Number,
      required: true, // e.g. 20 means 20% or ₹20
    },

    validForEvents: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Event", // only valid for these events
      },
    ],

    validForUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User", // only valid for these users (if empty → all users)
      },
    ],

    usedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },

    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", CouponSchema);
