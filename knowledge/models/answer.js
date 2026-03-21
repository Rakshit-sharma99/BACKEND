const mongoose = require("mongoose");

const AnswerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Question",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    uid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
      index: true,
    },

    // The actual answer
    value: { type: String, required: true },
    optionIndex: { type: Number }, // if MCQ, which option was picked

    // Quality signals
    responseTimeMs: { type: Number }, // how fast they answered

    // Moderation
    flagged: { type: Boolean, default: false },
    spamScore: { type: Number, default: 0, min: 0, max: 1 },

    userMeta: {
      profession: { type: String },
      passoutYear: { type: String },
    },

    universeMetaData: {
      name: { type: String },
      callSign: { type: String },
      logoKey: { type: String },
    },
  },
  { timestamps: true }
);

AnswerSchema.index({ questionId: 1, uid: 1 });
AnswerSchema.index({ questionId: 1, userId: 1 }, { unique: true }); // one answer per user per question

module.exports = mongoose.model("Answer", AnswerSchema);
