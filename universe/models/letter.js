const mongoose = require('mongoose');
const letterSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['booked', 'setInLocker', 'received', 'expired', 'blocked'],
    default: 'booked',
  },
  bookingId: {
    type: String,
  },
  lockerId: {
    type: String,
  },
  receiverId: {
    type: String,
  },
  senderId: {
    type: String,
  },
  anonymity: {
    type: Boolean,
  },
  date: {
    type: Date,
  },
  replyToAnonymous: {
    type: Boolean,
    default: false,
  },
});

module.exports = mongoose.model('Letter', letterSchema);
