const mongoose = require("mongoose");

const variationSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    tone: {
      type: String,
      enum: ["witty", "chill", "serious", "meme"],
      default: "witty",
    },
  },
  { _id: false }
);

const targetSegmentSchema = new mongoose.Schema(
  {
    profession: { type: [String], default: [] }, // ["Student", "Alumni"]
    minAnswerCount: { type: Number }, // asked after N total answers
    prerequisiteQuestionIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
    ],
  },
  { _id: false }
);

const QuestionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    slug: { type: String, unique: true }, // normalized dedup key

    // Classification
    domain: {
      type: String,
      enum: ["universe", "user"],
      required: true,
    },
    category: { type: String }, // e.g. "food", "hangout", "personality", "career"
    tags: [String],

    // Format
    format: {
      type: String,
      enum: ["mcq", "short", "rating", "boolean"],
      default: "mcq",
    },
    options: [String], // MCQ choices (empty for short/rating/boolean)

    // Source & lifecycle
    source: {
      type: String,
      enum: ["seed", "ai_generated", "extracted", "community"],
      default: "seed",
    },
    sourceRef: { type: String }, // chat log ID or seed batch name
    status: {
      type: String,
      enum: ["active", "review", "retired", "duplicate"],
      default: "active",
    },

    // Multi-tenant
    uid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
      index: true,
    }, // null = global question

    // Metrics
    timesAsked: { type: Number, default: 0 },
    timesAnswered: { type: Number, default: 0 },
    skipRate: { type: Number, default: 0 }, // % of users who skipped
    avgEngagement: { type: Number, default: 0.5 }, // 0-1 engagement score
    lastAskedAt: { type: Date },

    // Targeting
    targetSegment: targetSegmentSchema,

    // Witty variations
    variations: [variationSchema],

    universeMetaData: {
      name: { type: String },
      callSign: { type: String },
      logoKey: { type: String },
    },
  },
  { timestamps: true }
);

QuestionSchema.index({ domain: 1, status: 1, uid: 1 });
QuestionSchema.index({ slug: 1 });

module.exports = mongoose.model("Question", QuestionSchema);
