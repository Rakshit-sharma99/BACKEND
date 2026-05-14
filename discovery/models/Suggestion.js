const mongoose = require("mongoose");

const suggestionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    suggestedId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isMutual: {
      type: Boolean,
      default: false,
    },
    direction: {
      type: String,
      enum: ["forward", "reverse", "mutual"],
    },
    status: {
      type: String,
      enum: ["active", "connected", "dismissed"],
      default: "active",
    },
    actedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

suggestionSchema.index({ userId: 1, status: 1 });
suggestionSchema.index({ userId: 1, suggestedId: 1 }, { unique: true });

module.exports = mongoose.model("DiscoverySuggestion", suggestionSchema);
