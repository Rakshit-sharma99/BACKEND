/**
 * Proactive Message — Starman-initiated conversation messages.
 *
 * These are the PRIMARY objects for proactive engagement —
 * Starman speaks first, rather than waiting for the user.
 *
 * The push notification is just the delivery vehicle.
 * The message itself lives here and is inserted into a
 * Starman Conversation as a model-originated message.
 *
 * Documents auto-expire after 7 days via MongoDB TTL index
 * to keep DB costs low.
 */

const mongoose = require("mongoose");

/* ── Generation context (what informed the message) ── */
const generationContextSchema = new mongoose.Schema(
  {
    memoryStreak: { type: Number, default: 0 },
    lastMemoryDate: { type: Date },
    recentMemoryThemes: [{ type: String }],
    dayOfWeek: { type: String },
    templateKey: { type: String }, // which template was selected
  },
  { _id: false },
);

/* ── Trigger sub-document ── */
const triggerSchema = new mongoose.Schema(
  {
    source: {
      type: String,
      enum: ["sere_scheduler", "campaign", "admin"],
      default: "sere_scheduler",
    },
    rule: { type: String }, // e.g. "daily_memory_nudge"
  },
  { _id: false },
);

/* ── ProactiveMessage ── */
const ProactiveMessageSchema = new mongoose.Schema(
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
    },

    // The actual Starman message
    messageText: { type: String, required: true },

    // Message classification
    messageType: {
      type: String,
      enum: [
        "memory_nudge",
        "reflection",
        "check_in",
        "quest_prompt",
        "reactivation",
        "streak_milestone",
        "social_nudge",
      ],
      required: true,
      index: true,
    },

    // Starman voice
    tone: {
      type: String,
      enum: ["witty", "chill", "dramatic", "informative", "reflective", "curious"],
      default: "witty",
    },

    // Lifecycle
    status: {
      type: String,
      enum: [
        "pending",          // created, awaiting generation
        "generated",        // message generated, awaiting dispatch window
        "dispatched",       // sent to Starman conversation + push triggered
        "delivered",        // push confirmed delivered
        "opened",           // user opened the Starman chat
        "replied",          // user replied to the proactive message
        "expired",          // message expired without interaction
        "cancelled_by_action", // user performed the action before dispatch
      ],
      default: "pending",
      index: true,
    },

    // Scheduling (timezone-aware)
    scheduledFor: { type: Date, index: true },
    dispatchedAt: { type: Date },
    deliveredAt: { type: Date },
    openedAt: { type: Date },
    repliedAt: { type: Date },

    // Starman conversation link
    sessionId: { type: String }, // Starman conversation sessionId

    // Push notification link
    pushNotificationId: { type: String },
    pushDelivered: { type: Boolean, default: false },

    // Context used for generation
    generationContext: generationContextSchema,

    // What triggered this message
    trigger: triggerSchema,

    // Deep-link action for the push notification
    action: {
      navigateTo: { type: String, default: "starmanChat" },
      params: { type: mongoose.Schema.Types.Mixed, default: {} },
    },

    // Expiry — messages expire next morning
    expiresAt: { type: Date, index: true },

    universeMetaData: {
      name: { type: String },
      callSign: { type: String },
      logoKey: { type: String },
    },
  },
  { timestamps: true },
);

// Auto-delete documents after 7 days to save DB costs
ProactiveMessageSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 },
);

// Compound indexes for common queries
ProactiveMessageSchema.index({ userId: 1, status: 1 });
ProactiveMessageSchema.index({ status: 1, scheduledFor: 1 });
ProactiveMessageSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model("ProactiveMessage", ProactiveMessageSchema);
