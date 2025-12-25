const mongoose = require("mongoose");

const recentSearchSchema = new mongoose.Schema(
  {
    

    type: {
      type: String,
      enum: ["club", "community", "event", "profile", "text"],
      required: true,
    },

    payload: {
      type: Object,
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("RecentSearch", recentSearchSchema);
