const mongoose = require("mongoose");

const traitSchema = new mongoose.Schema(
  {
    key: { type: String, required: true },
    value: { type: String, required: true },
    source: { type: String }, // questionId or "inferred"
    updatedAt: { type: Date, default: Date.now },
    confidence: { type: Number, default: 1 },
  },
  { _id: false }
);

const UserKnowledgeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    uid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
      required: true,
    },

    // Structured personal intel (from "user" domain questions)
    traits: [traitSchema],

    // Engagement profile
    totalAnswers: { type: Number, default: 0 },
    trustScore: { type: Number, default: 0.5, min: 0, max: 1 },
    streak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    lastAnsweredAt: { type: Date },

    // Segments (auto-computed)
    segments: [String], // ["fresher", "tech_enthusiast", "night_owl"]

    // Questions already answered (to avoid repeats)
    answeredQuestionIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("UserKnowledge", UserKnowledgeSchema);
