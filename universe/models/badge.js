const mongoose = require('mongoose');

const badgeSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      enum: [
        '100+ contributions',
        'Seasoned Steward',
        'Time-Tested Trooper',
        'Veteran Voyager',
        'Stellar Performer',
      ],
    },
    organisationId: {
      type: String,
    },
    organisationType: {
      type: String,
      enum: ['Club', 'Community', 'Macbease'],
    },
    ownedBy: {
      type: String,
    },
    url: {
      type: String,
    },
    description: {
      type: String,
    },
    organisationInfo: {
      type: Object,
    },
    givenOn: {
      type: Date,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Badge', badgeSchema);
