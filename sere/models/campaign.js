const mongoose = require("mongoose");

/* ── Targeting criteria ── */
const targetingSchema = new mongoose.Schema(
  {
    lifecycleStages: { type: [String], default: [] }, // ["new", "dormant"]
    interests: { type: [String], default: [] },
    professions: { type: [String], default: [] },
    minEngagementScore: { type: Number },
    maxEngagementScore: { type: Number },
    universeIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Universe" }],
  },
  { _id: false },
);

/* ── Action sub-document ── */
const actionSchema = new mongoose.Schema(
  {
    navigateTo: { type: String },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

/* ── Campaign ── */
const CampaignSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    uid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
      index: true,
    },

    status: {
      type: String,
      enum: ["draft", "active", "paused", "completed"],
      default: "draft",
    },

    // Content templates (supports {{user.name}}, {{user.callSign}} vars)
    titleTemplate: { type: String, required: true },
    bodyTemplate: { type: String, required: true },
    tone: {
      type: String,
      enum: ["witty", "chill", "dramatic", "informative"],
      default: "witty",
    },

    // Targeting
    targeting: { type: targetingSchema, default: () => ({}) },

    // Scheduling
    startDate: { type: Date },
    endDate: { type: Date },
    frequency: {
      type: String,
      enum: ["once", "daily", "weekly"],
      default: "once",
    },
    lastExecutedAt: { type: Date },

    // Action
    action: actionSchema,

    // Metrics
    totalSent: { type: Number, default: 0 },
    totalClicked: { type: Number, default: 0 },
    totalDismissed: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0, min: 0, max: 1 },

    universeMetaData: {
      name: { type: String },
      callSign: { type: String },
      logoKey: { type: String },
    },
  },
  { timestamps: true },
);

CampaignSchema.index({ status: 1, startDate: 1 });

module.exports = mongoose.model("Campaign", CampaignSchema);
