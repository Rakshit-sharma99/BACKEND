const mongoose = require("mongoose");

const OrbitSchema = new mongoose.Schema({
  id: {
    type: Number,
  },
  title: String,
  subTitle: String,
}, { _id: false });

const QuestSchema = new mongoose.Schema({
  orbit: {
    type: OrbitSchema,
    required: false
  },
  title: {
    type: String,
    required: true
  },
  description: {
    type: String
  },
  logo: {
    type: String,
  },
  secondaryLogo: {
    type: String
  },
  category: {
    type: String,
    enum: ["Club", "Community", "Event"],
    required: true
  },

  metric: {
    type: String,
    required: true
  },

  type: {
    type: String,
    enum: ["continuous", "discrete"],
    required: true
  },

  numOfEntities: {
    type: Number,
    default: 1
  },

  target: {
    type: Number,
    required: true
  },

  ip: {
    type: Number,
    required: true
  },

  is_active: { type: Boolean, default: true },

  frequency: {
    type: String,
    enum: ["daily", "weekly", "monthly", "none"],
    default: "none"
  }

}, { timestamps: true });

module.exports = mongoose.model("Quest", QuestSchema);