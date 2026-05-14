const mongoose = require("mongoose");

const contactSyncSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    userPhoneHash: {
      type: String,
      required: false,
      sparse: true,
      index: true,
    },
    contactHashes: {
      type: [String],
      default: [],
    },
    consentGranted: {
      type: Boolean,
      default: true,
    },
    syncedAt: {
      type: Date,
      default: Date.now,
    },
    syncCount: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

// Critical indexes for bidirectional matching
contactSyncSchema.index({ userPhoneHash: 1 });  // Forward: find users by their phone hash
contactSyncSchema.index({ contactHashes: 1 });   // Reverse: find users who have a hash in their contacts
contactSyncSchema.index({ userId: 1 }, { unique: true });

module.exports = mongoose.model("ContactSync", contactSyncSchema);
