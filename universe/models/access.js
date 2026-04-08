const mongoose = require("mongoose");

const AccessCodeSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    isForValidUser: {
      type: Boolean,
      default: false,
    },
    validForUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("AccessCode", AccessCodeSchema);