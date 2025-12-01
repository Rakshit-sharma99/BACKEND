const mongoose = require("mongoose");

const logSchema = new mongoose.Schema(
  {
    c_source: {
      type: String,
      enum: ["system", "quest", "club", "community", "user", "badge", "offer"],
      required: true,
    },
    d_source: {
      type: String,
      enum: ["system", "quest", "club", "community", "user", "badge", "offer"],
      required: true,
    },
    c_ref: {
      type: mongoose.Schema.Types.ObjectId,
    },
    d_ref: {
      type: mongoose.Schema.Types.ObjectId,
    },
    description: {
      type: String,
    },
    ip: {
      type: Number,
      required: true,
    },
    status: {
      type: Number,
      enum: [0, 1], // 0 = Failed, 1 = Success
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Log", logSchema);
