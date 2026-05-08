const mongoose = require("mongoose");

const mouSchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      unique: true,
    },
    clubId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      required: true,
    },
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    universityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
    },
    eventName: {
      type: String,
      required: true,
    },
    clubName: {
      type: String,
      required: true,
    },
    creatorName: {
      type: String,
    },
    creatorEmail: {
      type: String,
    },

    // ── Admin-filled parameters ──
    parameters: {
      commissionRate: { type: Number, default: 0 },
      platformFee: { type: Number, default: 0 },
      paymentTerms: { type: String, default: "" },
      cancellationPolicy: { type: String, default: "" },
      liabilityClause: { type: String, default: "" },
      customClauses: { type: [String], default: [] },
      custom: [
        {
          key: { type: String },
          value: { type: String },
          _id: false,
        },
      ],
    },

    // ── DocuSign integration ──
    docusign: {
      templateId: { type: String },
      envelopeId: { type: String },
      signingUrl: { type: String }, // ephemeral, usually not persisted, but can be for debugging
      documentS3Key: { type: String }, // s3 key after signing
    },

    // ── Status tracking ──
    status: {
      type: String,
      enum: [
        "draft",     // initially created
        "ready",     // admin filled parameters
        "sent",      // admin sent to creator
        "viewed",    // creator viewed
        "signed",    // creator signed
        "declined",  // creator declined
        "voided",    // admin voided
        "expired",   // envelope expired
      ],
      default: "draft",
    },

    // ── Audit trail ──
    history: [
      {
        action: { type: String },
        actor: { type: mongoose.Schema.Types.ObjectId },
        actorRole: { type: String, enum: ["system", "admin", "creator", "docusign"] },
        timestamp: { type: Date, default: Date.now },
        metadata: { type: mongoose.Schema.Types.Mixed },
        _id: false,
      },
    ],

    sentAt: { type: Date },
    signedAt: { type: Date },
    expiresAt: { type: Date },
  },
  {
    timestamps: true,
  }
);

// Indexes
mouSchema.index({ eventId: 1 }, { unique: true });
mouSchema.index({ clubId: 1, status: 1 });
mouSchema.index({ creatorId: 1, status: 1 });
mouSchema.index({ "docusign.envelopeId": 1 });
mouSchema.index({ universityId: 1, status: 1 });

module.exports = mongoose.model("MOU", mouSchema);
