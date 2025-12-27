const mongoose = require("mongoose");

const joinLinkSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Club", "Community", "Memory"],
      required: true,
    },
    belongsTo: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "type", // This tells Mongoose to use the value of `type` as the model name for the ref
    },
    expiry: {
      type: Date,
      default: null, // null = never expires
    },
    maxUses: {
      type: Number,
      default: -1,
    },
    usedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: Number,
      enum: [0, 1],
      default: 1, // 1 = active, 0 = inactive
    },
    accessibleTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    metaData: {
      type: Object,
    },
    uid: {
    type: String,
  },
  universeMetaData: {
    name: String,
    location: String,
    logo: String,
    callSign: String,
  }
  },
  {
    timestamps: true,
  }
);

joinLinkSchema.methods.canBeUsed = function (userId) {
  const notExpired = !this.expiry || new Date() < this.expiry;
  const underLimit = this.maxUses === -1 || this.usedBy.length < this.maxUses;
  const isActive = this.status === 1;

  // If accessibleTo has entries, user must be in the list
  const hasAccess =
    this.accessibleTo.length === 0 ||
    this.accessibleTo.some((id) => id.toString() === userId.toString());

  const alreadyUsed = this.usedBy.some(
    (id) => id.toString() === userId.toString()
  );

  return isActive && notExpired && underLimit && hasAccess && !alreadyUsed;
};

module.exports = mongoose.model("JoinLink", joinLinkSchema);
