const mongoose = require("mongoose");
const eventSchema = new mongoose.Schema({
  url: {
    type: String,
  },
  name: {
    type: String,
  },
  description: {
    type: String,
  },
  place: {
    type: String,
  },
  startTime: {
    type: Date,
  },
  endTime: {
    type: Date,
  },
  eventDate: {
    type: Date,
  },
  eventEndDate: {
    type: Date,
  },
  ticketDate: {
    type: Date,
  },
  postedBy: {
    type: String,
  },
  dl: {
    type: Boolean,
  },
  ticketAvailable: {
    type: Boolean,
  },
  ticketTypes: {
    type: Array,
  },
  bookedBy: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  belongsTo: {
    type: Object,
  },
  status: {
    type: String,
    enum: ["pending", "featured", "past and unclear", "past and clear"],
    default: "pending",
  },
  amtPaid: {
    type: Number,
  },
  amtPaidTo: {
    type: Number,
  },
  ticketSellingDays: {
    type: Array,
  },
  cumulativeRevenue: {
    type: [Number],
    default: [],
  },
  courseAnalytics: {
    type: Array,
  },
  faq: {
    type: Array,
  },
  eventManagerMail: {
    type: String,
  },
  eventManagerPhone: {
    type: String,
  },
  authorizedPerson: {
    type: Object,
  },
  itineraries: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Itinerary",
    },
  ],
});

module.exports = mongoose.model("Event", eventSchema);
