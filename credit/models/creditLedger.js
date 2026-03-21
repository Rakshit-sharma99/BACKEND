const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "daily_grant",
        "chat_spend",
        "answer_refill",
        "ip_purchase",
        "bonus",
      ],
      required: true,
    },
    amount: { type: Number, required: true }, // positive = credit, negative = debit
    ref: { type: String }, // e.g. questionId or chatSessionId
    reason: { type: String },
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false },
);

const CreditLedgerSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    uid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
      required: true,
      index: true,
    },

    // Daily balance
    date: { type: String, required: true }, // "2026-03-21" — partition key
    balance: { type: Number, default: 10, min: 0 },

    // Audit trail
    transactions: [transactionSchema],

    // Anti-abuse
    answersToday: { type: Number, default: 0 },
    lastAnswerAt: { type: Date },

    universeMetaData: {
      name: { type: String },
      callSign: { type: String },
      logoKey: { type: String },
    },
  },
  { timestamps: true },
);

// Compound index for fast daily lookups
CreditLedgerSchema.index({ userId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("CreditLedger", CreditLedgerSchema);
