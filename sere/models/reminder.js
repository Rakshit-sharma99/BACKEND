const mongoose = require("mongoose");

/* ── Interaction sub-document ── */
const interactionSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["clicked", "dismissed", "ignored"],
    },
    at: { type: Date },
    actionTaken: { type: Boolean, default: false },
    responseTimeMs: { type: Number },
  },
  { _id: false },
);

/* ── Trigger sub-document ── */
const triggerSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["system", "admin", "user", "deferred_query"],
      required: true,
    },
    ref: { type: String },   // eventId, campaignId, queryId, etc.
    rule: { type: String },  // rule name that matched
  },
  { _id: false },
);

/* ── Action sub-document (deep-link CTA) ── */
const actionSchema = new mongoose.Schema(
  {
    navigateTo: { type: String },
    params: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { _id: false },
);

/* ── Reminder ── */
const ReminderSchema = new mongoose.Schema(
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

    type: {
      type: String,
      enum: [
        "onboarding",
        "streak",
        "deferred_answer",
        "campaign",
        "user_created",
        "re_engagement",
        "trending",
        "memory_nudge",
        "proactive_starman",
      ],
      required: true,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "scheduled",
        "delivered",
        "clicked",
        "dismissed",
        "expired",
      ],
      default: "pending",
      index: true,
    },

    // Content
    title: { type: String, required: true },
    body: { type: String, required: true },
    tone: {
      type: String,
      enum: ["witty", "chill", "dramatic", "informative"],
      default: "witty",
    },

    // Delivery
    channel: {
      type: String,
      enum: ["push", "in_app", "chat_nudge"],
      default: "push",
    },
    scheduledFor: { type: Date, index: true },
    deliveredAt: { type: Date },

    // Tracking
    interaction: interactionSchema,

    // Context
    trigger: triggerSchema,

    // Action (CTA)
    action: actionSchema,

    // Expiry
    expiresAt: { type: Date, index: true },

    universeMetaData: {
      name: { type: String },
      callSign: { type: String },
      logoKey: { type: String },
    },
  },
  { timestamps: true },
);

// Compound indexes for common queries
ReminderSchema.index({ userId: 1, status: 1 });
ReminderSchema.index({ status: 1, scheduledFor: 1 });

module.exports = mongoose.model("Reminder", ReminderSchema);
