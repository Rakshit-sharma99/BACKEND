const mongoose = require("mongoose");

/* ── Watchlist item (user-created triggers) ── */
const watchlistItemSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["event", "club_post", "hackathon", "custom"],
      required: true,
    },
    query: { type: String, required: true },
    active: { type: Boolean, default: true },
    createdAt: { type: Date, default: Date.now },
    lastCheckedAt: { type: Date },
    matchedAt: { type: Date },
  },
  { _id: true },
);

/* ── Deferred query (unanswered Starman questions) ── */
const deferredQuerySchema = new mongoose.Schema(
  {
    query: { type: String, required: true },
    askedAt: { type: Date, default: Date.now },
    resolved: { type: Boolean, default: false },
    resolvedAt: { type: Date },
    answerId: { type: String },
  },
  { _id: true },
);

/* ── Onboarding checklist ── */
const onboardingSchema = new mongoose.Schema(
  {
    joinedClub: { type: Boolean, default: false },
    attendedEvent: { type: Boolean, default: false },
    uploadedMemory: { type: Boolean, default: false },
    addedAssets: { type: Boolean, default: false },
    firstPost: { type: Boolean, default: false },
  },
  { _id: false },
);

/* ── UserEngagement ── */
const UserEngagementSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    uid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
      required: true,
    },

    // Lifecycle
    lifecycleStage: {
      type: String,
      enum: ["new", "active", "dormant", "churned"],
      default: "new",
    },
    signupDate: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now },

    // Engagement metrics
    totalRemindersReceived: { type: Number, default: 0 },
    totalRemindersClicked: { type: Number, default: 0 },
    totalRemindersDismissed: { type: Number, default: 0 },
    clickRate: { type: Number, default: 0, min: 0, max: 1 },

    // Personalization
    humorTolerance: { type: Number, default: 0.7, min: 0, max: 1 },
    preferredTone: {
      type: String,
      enum: ["witty", "chill", "dramatic", "informative"],
      default: "witty",
    },
    preferredChannels: {
      type: [String],
      default: ["push", "in_app"],
    },
    quietHoursStart: { type: Number, default: 23, min: 0, max: 23 },
    quietHoursEnd: { type: Number, default: 7, min: 0, max: 23 },

    // Throttling
    remindersSentToday: { type: Number, default: 0 },
    lastReminderAt: { type: Date },
    consecutiveIgnores: { type: Number, default: 0 },
    optedOut: { type: Boolean, default: false },

    // Timezone (inferred from university location)
    timezone: { type: String, default: "Asia/Kolkata" },

    // Memory tracking (updated via memory.created Kafka event)
    memoryCreatedToday: { type: Boolean, default: false },
    lastMemoryDate: { type: Date },
    memoryStreak: { type: Number, default: 0 },

    // Proactive messaging state
    lastProactiveNudgeAt: { type: Date },
    proactiveNudgesSent: { type: Number, default: 0 },
    proactiveNudgesOpened: { type: Number, default: 0 },
    proactiveNudgesReplied: { type: Number, default: 0 },
    consecutiveNudgeIgnores: { type: Number, default: 0 },
    proactiveOptOut: { type: Boolean, default: false },

    // Onboarding checklist
    onboarding: { type: onboardingSchema, default: () => ({}) },

    // User-created triggers
    watchlist: [watchlistItemSchema],

    // Deferred queries
    deferredQueries: [deferredQuerySchema],

    universeMetaData: {
      name: { type: String },
      callSign: { type: String },
      logoKey: { type: String },
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("UserEngagement", UserEngagementSchema);
