const mongoose = require("mongoose");

const funnelSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
    index: true,
  },

  date: {
    type: Date, // 00:00 day bucket
    required: true,
    index: true,
  },

  buckets: {
    type: Map,
    of: {
      hours: {
        type: Map,
        of: {
          impressions: { type: Number, default: 0 },
          ticketSelections: { type: Number, default: 0 },
          checkoutInitiated: { type: Number, default: 0 },
          ordersCompleted: { type: Number, default: 0 },
        },
        default: {},
      },
    },
    default: {},
  },
});

funnelSchema.index(
  { eventId: 1, date: 1 },
  { unique: true }
);

module.exports = mongoose.model("EventFunnel", funnelSchema);
