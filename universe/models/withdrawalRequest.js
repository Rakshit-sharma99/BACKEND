const mongoose = require("mongoose");

const withdrawalRequestSchema = new mongoose.Schema(
  {
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
      index: true,
    },
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      required: true,
      index: true,
    },
    amountPaise: {
      type: Number,
      required: true,
      min: 1,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED", "CANCELLED"],
      default: "PENDING",
      index: true,
    },
    idempotencyKey: {
      type: String,
      required: true,
      unique: true,
    },
    requestedBy: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    bankSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    note: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    payoutReference: {
      type: String,
      trim: true,
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    failureReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },
  },
  { timestamps: true },
);

withdrawalRequestSchema.index({ clubId: 1, createdAt: -1 });

module.exports = mongoose.model("WithdrawalRequest", withdrawalRequestSchema);
