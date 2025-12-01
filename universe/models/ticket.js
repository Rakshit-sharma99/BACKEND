const mongoose = require('mongoose');
const ticketSchema = new mongoose.Schema({
  boughtBy: {
    type: mongoose.Types.ObjectId,
    ref: 'User',
  },
  eventId: {
    type: mongoose.Types.ObjectId,
    ref: 'Event',
  },
  paymentId: {
    type: String,
  },
  amtPaid: {
    type: Number,
  },
  status: {
    type: String,
    enum: ['redeemed', 'active', 'refunded', 'expired'],
    default: 'active',
  },
  generatedAt: {
    type: Date,
  },
  reviewMsg: {
    type: String,
  },
  reviewUrls: {
    type: String,
  },
  reviewStars: {
    type: Number,
  },
  type: {
    type: String,
  },
  reviewLiked: {
    type: Boolean,
  },
  rsvp: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Itinerary',
    },
  ],
});

module.exports = mongoose.model('Ticket', ticketSchema);
