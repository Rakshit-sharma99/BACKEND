const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    endedAt: {
      type: Date,
    },
    callStack: {
      type: [mongoose.Schema.Types.Mixed],
    },
  },
  {
    timestamps: { createdAt: "startedAt", updatedAt: "endedAt" },
  }
);

module.exports = mongoose.model("Session", sessionSchema);
