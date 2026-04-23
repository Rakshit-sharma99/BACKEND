/**
 * Live Notification Log — lightweight analytics model.
 *
 * Tracks delivery, dismissal, and action events for
 * live notifications. This is intentionally ephemeral —
 * documents auto-expire after 7 days via MongoDB TTL index.
 */

const mongoose = require("mongoose");

const LiveNotificationLogSchema = new mongoose.Schema(
  {
    notificationId: {
      type: String,
      required: true,
      index: true,
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        "dm",
        "mention",
        "share",
        "club_post",
        "community_announcement",
        "event_update",
        "reaction",
        "follow",
        "system",
      ],
    },
    status: {
      type: String,
      enum: ["delivered", "suppressed"],
      default: "delivered",
    },
    groupKey: { type: String },
    deliveredAt: { type: Date },
    dismissedAt: { type: Date },
    actionTakenAt: { type: Date },
    ttl: { type: Number },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

// Auto-delete logs after 7 days
LiveNotificationLogSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 },
);

// Compound indexes for analytics queries
LiveNotificationLogSchema.index({ targetUserId: 1, createdAt: -1 });
LiveNotificationLogSchema.index({ type: 1, status: 1 });

module.exports = mongoose.model(
  "LiveNotificationLog",
  LiveNotificationLogSchema,
);
