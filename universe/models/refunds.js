const mongoose = require("mongoose");

const RefundSchema = new mongoose.Schema(
  {
    paymentId: {
      type: String,
      required: true,
      unique: true, // Ensures a payment ID can't have multiple refunds
    },
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    amtRefunded: {
      type: Number,
      required: true,
    },
    refundStatus: {
      type: String,
      enum: ["PENDING", "SUCCESS", "FAILED"],
      default: "PENDING",
    },
    refundedAt: {
      type: Date,
      default: null, // Set when refund is processed
    },
    reason: {
      type: String,
      default: "Transaction Error", // Default refund reason
    },
    refundTransactionId: {
      type: String,
      default: null, // Store Razorpay refund ID or transaction reference
    },
  },
  { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

const Refund = mongoose.model("Refund", RefundSchema);

module.exports = Refund;
