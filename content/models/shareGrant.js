const mongoose = require("mongoose");

const shareGrantSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: ["content"],
      required: true,
    },
    resourceId: {
      type: String,
      required: true,
      index: true,
    },
    createdBy: {
      type: String,
      required: true,
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    accessCount: {
      type: Number,
      default: 0,
    },
    lastAccessedAt: Date,
    createdFromIp: String,
    createdFromUserAgent: String,
  },
  { timestamps: true },
);

shareGrantSchema.index({ resourceType: 1, resourceId: 1, createdBy: 1 });
shareGrantSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("ShareGrant", shareGrantSchema);
