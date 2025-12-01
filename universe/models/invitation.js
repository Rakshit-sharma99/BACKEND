const mongoose = require('mongoose');
const invitationSchema = new mongoose.Schema({
  sentBy: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'sentByModel',
  },
  sentTo: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'sentToModel',
  },
  cc: {
    type: Array,
  },
  senderDesignation: {
    type: String,
  },
  type: {
    type: String,
    enum: [
      'Leader Change',
      'Promotion',
      'Proposal',
      'Content Team Application',
    ],
  },
  expiration: {
    type: Date,
  },
  state: {
    type: String,
    enum: ['undecided', 'accepted', 'rejected', 'expired'],
    default: 'undecided',
  },
  text: {
    type: String,
  },
  action: {
    type: Object,
  },
  attachedFile: {
    type: Array,
  },
  subject: {
    type: String,
  },
  endorsedBy: {
    type: Array,
  },
  sentByModel: {
    type: String,
    required: true,
    enum: ['User', 'Admin'],
    default: 'User',
  },
  sentToModel: {
    type: String,
    required: true,
    enum: ['User', 'Admin'],
    default: 'User',
  },
});

module.exports = mongoose.model('Invitation', invitationSchema);
