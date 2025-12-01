const mongoose = require('mongoose');

const OrgMetaDataSchema = new mongoose.Schema(
  {
    description: String,
    foundedYear: Number,
    industry: String,
    headquarters: String,
    numberOfEmployees: Number,
    revenue: String,
    website: String,
    socialLinks: {
      linkedin: String,
      facebook: String,
      instagram: String,
    },
    keyPeople: [
      {
        name: String,
        role: String,
      },
    ],
    products: [String],
    locations: [String],
  },
  { timestamps: true }
);

const OrgSchema = new mongoose.Schema({
  orgName: {
    type: String,
    required: true,
  },
  orgLogo: {
    type: String,
    required: true,
  },
  orgMetaData: {
    type: OrgMetaDataSchema,
    required: false,
  },
  working: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  ],
  uid: {
    type: String,
  },
  universeMetaData: {
    name: String,
    location: String,
    logo: String,
    callSign: String,
  }
});

module.exports = mongoose.model('Org', OrgSchema);
