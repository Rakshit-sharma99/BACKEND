const mongoose = require("mongoose");

// ── Sub-schemas ──

const hotEntrySchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    sender: { type: String },
    timestamp: { type: Number, required: true },
    category: { type: String, default: "general" },
    contributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
  },
  { _id: false }
);

const longTermEntrySchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    date: { type: String }, // optional — for deadlines
    url: { type: String }, // optional — for resources
    source: { type: String }, // entity name or sender
    period: { type: String }, // optional — for summaries (e.g. "2026-W13")
    addedAt: { type: Date, default: Date.now },
    contributorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
  },
  { _id: false }
);

// ── Main Schema ──

const ExternalContextSchema = new mongoose.Schema(
  {
    uid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
      required: true,
      index: true,
    },
    entityId: {
      type: String,
      required: true,
    },
    entityName: {
      type: String,
      required: true,
    },
    platform: {
      type: String,
      enum: ["whatsapp", "discord", "telegram"],
      required: true,
    },
    linkedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Lifecycle
    status: {
      type: String,
      enum: ["initializing", "synced", "error"],
      default: "initializing",
    },
    lastSyncedAt: { type: Date },
    messagesCursor: { type: Number, default: 0 },

    // Sync range tracking
    oldestMessageAt: { type: Number, default: 0 },   // Unix ts of oldest ingested message
    newestMessageAt: { type: Number, default: 0 },    // Unix ts of newest ingested message
    syncDepthDays: { type: Number, default: 7 },      // How many days of history were requested

    // Hot tier — recent raw-ish entries (rolling window)
    hotContext: {
      entries: [hotEntrySchema],
      maxEntries: { type: Number, default: 500 },
    },

    // Long-term tier — LLM-distilled structured knowledge
    longTermContext: {
      deadlines: [longTermEntrySchema],
      announcements: [longTermEntrySchema],
      resources: [longTermEntrySchema],
      decisions: [longTermEntrySchema],
      summaries: [longTermEntrySchema],
    },
  },
  { timestamps: true }
);

// Compound unique index: one entity per university
ExternalContextSchema.index({ uid: 1, entityId: 1 }, { unique: true });
ExternalContextSchema.index({ uid: 1, platform: 1 });
ExternalContextSchema.index({ status: 1 });

module.exports = mongoose.model("ExternalContext", ExternalContextSchema);
