const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema(
  {
    accountHolderName: {
      type: String,
      trim: true,
      default: null,
    },
    maskedAccountNumber: {
      type: String,
      trim: true,
      default: null,
    },
    ifscCode: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    encryptedPayload: {
      type: String,
      default: null,
    },
    lastUpdatedBy: {
      type: String,
      default: null,
    },
    lastUpdatedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false },
);

const walletSchema = new mongoose.Schema(
  {
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      required: true,
      unique: true,
      index: true,
    },
    currency: {
      type: String,
      default: "INR",
      uppercase: true,
      trim: true,
    },
    availableBalancePaise: {
      type: Number,
      default: 0,
    },
    lockedBalancePaise: {
      type: Number,
      default: 0,
      min: 0,
    },
    bankAccount: {
      type: bankAccountSchema,
      default: () => ({}),
    },
    lastWithdrawalRequestedAt: {
      type: Date,
      default: null,
    },
    lastReconciledAt: {
      type: Date,
      default: null,
    },
    lastReconciledLedgerBalancePaise: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Wallet", walletSchema);
