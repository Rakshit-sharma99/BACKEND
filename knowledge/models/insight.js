const mongoose = require("mongoose");

const distributionEntrySchema = new mongoose.Schema(
  {
    value: { type: String, required: true },
    count: { type: Number, default: 0 },
    percentage: { type: Number, default: 0 },
    trend: {
      type: String,
      enum: ["rising", "stable", "declining"],
      default: "stable",
    },
    lastSeen: { type: Date },
  },
  { _id: false }
);

const snapshotSchema = new mongoose.Schema(
  {
    date: { type: Date, default: Date.now },
    topAnswer: { type: String },
    confidence: { type: Number },
  },
  { _id: false }
);

const InsightSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
    },
    uid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
    },

    // Consensus data
    totalResponses: { type: Number, default: 0 },

    distribution: [distributionEntrySchema],

    // Computed belief
    topAnswer: { type: String },
    confidence: { type: Number, default: 0, min: 0, max: 1 },
    consensus: {
      type: String,
      enum: ["strong", "moderate", "weak", "contested"],
      default: "weak",
    },

    // Natural language summary (AI-generated or template-based)
    summary: { type: String },

    // Freshness
    lastUpdatedAt: { type: Date, default: Date.now },
    snapshotHistory: [snapshotSchema],

    universeMetaData: {
      name: { type: String },
      callSign: { type: String },
      logoKey: { type: String },
    },
  },
  { timestamps: true }
);

InsightSchema.index({ questionId: 1, uid: 1 }, { unique: true });

module.exports = mongoose.model("Insight", InsightSchema);
