const mongoose = require("mongoose");

const walletTransactionSchema = new mongoose.Schema(
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
    direction: {
      type: String,
      enum: ["CREDIT", "DEBIT"],
      required: true,
    },
    category: {
      type: String,
      enum: [
        "TICKET_SALE",
        "MERCHANDISE",
        "AD_REVENUE",
        "WITHDRAWAL",
        "E_CERTIFICATE",
        "BADGE",
        "BOOST",
        "ADJUSTMENT",
      ],
      required: true,
    },
    entryKind: {
      type: String,
      enum: [
        "CREDIT_APPLIED",
        "PURCHASE_DEBIT",
        "WITHDRAWAL_LOCK",
        "WITHDRAWAL_RELEASE",
        "WITHDRAWAL_SETTLEMENT",
        "MANUAL_ADJUSTMENT",
      ],
      required: true,
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
    sourceType: {
      type: String,
      enum: [
        "RAZORPAY_PAYMENT",
        "INTERNAL_PURCHASE",
        "WITHDRAWAL_REQUEST",
        "ADMIN",
        "SYSTEM",
      ],
      required: true,
    },
    sourceId: {
      type: String,
      default: null,
      index: true,
    },
    idempotencyKey: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
    },
    razorpayPaymentId: {
      type: String,
      default: null,
      unique: true,
      sparse: true,
    },
    relatedEntityId: {
      type: String,
      default: null,
      index: true,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    pricingSnapshot: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdBy: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

walletTransactionSchema.index({ clubId: 1, createdAt: -1 });
walletTransactionSchema.index({ clubId: 1, category: 1, createdAt: -1 });

module.exports = mongoose.model("WalletTransaction", walletTransactionSchema);
