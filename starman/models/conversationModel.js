/**
 * Conversation Model — Rolling 30-day conversation log.
 *
 * Stores full chat history per session so conversations survive
 * service restarts and can be browsed from the frontend.
 *
 * The TTL index on `createdAt` automatically purges conversations
 * older than 30 days, keeping storage bounded.
 */

const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ["user", "model"], required: true },
    text: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    buttons: { type: Array, default: [] },
  },
  { _id: false },
);

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      default: "New Chat",
    },
    messages: [messageSchema],
    lastActive: {
      type: Date,
      default: Date.now,
    },

    // Conversation origin — "user" (default) or "proactive" (Starman-initiated)
    origin: {
      type: String,
      enum: ["user", "proactive"],
      default: "user",
    },

    // Context for proactive conversations (only set when origin="proactive")
    proactiveContext: {
      type: { type: String },          // "memory_nudge", "reflection", etc.
      proactiveMessageId: String,       // Reference to SERE ProactiveMessage._id
      triggeredBy: String,              // "sere_scheduler"
    },
  },
  {
    timestamps: true, // adds createdAt + updatedAt
  },
);

// Auto-delete conversations after 30 days
conversationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

// Compound index for efficient user conversation listing
conversationSchema.index({ userId: 1, lastActive: -1 });

module.exports = mongoose.model("Conversation", conversationSchema);
