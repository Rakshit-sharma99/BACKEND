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

const starmanPersonaSchema = new mongoose.Schema(
  {
    name: { type: String, default: "Starman" },
    creature: { type: String, default: "AI astronaut" },
    vibe: { type: String, default: "playful" }, // warm, sharp, chaotic, calm, playful
    emoji: { type: String, default: "🚀" },
    formalityLevel: { type: Number, default: 2, min: 1, max: 5 },
    humorLevel: { type: Number, default: 4, min: 1, max: 5 },
    verbosityLevel: { type: Number, default: 2, min: 1, max: 5 },
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

    // ── User Identity (populated from explicit question answers) ──
    preferredName: { type: String },    // "what to call them"
    pronouns: { type: String },         // optional
    timezone: { type: String },         // e.g. "Asia/Kolkata"
    role: { type: String },             // "founder", "member", "explorer", "alumni", "fresher"

    // ── Starman Persona (per-user Starman tuning) ──
    starmanPersona: { type: starmanPersonaSchema, default: () => ({}) },

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
