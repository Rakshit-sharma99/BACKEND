const mongoose = require("mongoose");

const RewardSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["cash", "certificate", "custom"],
      default: "custom",
      required: true
    },

    amount: {
      value: {
        type: Number,
        min: 0
      },
      currency: {
        type: String,
        uppercase: true,
        default: "INR",
        minlength: 3,
        maxlength: 3
      }
    },

    // optional but useful
    title: {
      type: String, // e.g. "1st Prize", "Winner"
    },

    description: {
      type: String,
    }
  },
  {
    timestamps: true
  }
);
const itinerarySchema = new mongoose.Schema(
  {
    eventId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    venue: {
      type: String,
      required: true,
      trim: true,
    },
    cover: {
      type: String,
      required: true,
    },
    start: {
      type: Date,
      required: true,
    },
    end: {
      type: Date,
      required: true,
    },
    allowed: [
      {
        type: String,
      },
    ],
    rsvpEnabled: {
      type: Boolean,
      default: false,
    },
    rsvpList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    maxRsvps: {
      type: Number,
      min: 0,
    },
    notifyList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    status: {
      type: String,
      enum: ["Upcoming", "Ongoing", "Completed", "Canceled"],
      default: "Upcoming",
    },
    attendanceList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    grandRewards: [
      RewardSchema
    ],
    sub_Itinerary: [{
      title: String,
      desc: String,
      rewards: [
        RewardSchema
      ],
      startTime: {
        type: Date,
      },
      endTime: {
        type: Date
      }
    }],
    // documents of rules or instructions for participants
    attachment: {
      type: String
    },
  },
  { timestamps: true }
);

itinerarySchema.pre("save", function (next) {
  if (this.end && new Date() > this.end) {
    this.status = "Completed";
  }
  next();
});

module.exports = mongoose.model("Itinerary", itinerarySchema);
