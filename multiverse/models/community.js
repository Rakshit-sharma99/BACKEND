const mongoose = require("mongoose");
const { fieldsEnum, levelEnum } = require("../controllers/utils");

const communitySchema = new mongoose.Schema({
  title: {
    type: String,
  },
  cover: {
    type: String,
  },
  secondaryCover: {
    type: String,
  },
  label: {
    type: String,
  },
  createdOn: {
    type: Date,
  },
  tag: {
    type: Array,
  },
  entryRules: {
    level: {
      type: String,
      enum: levelEnum,
    },
    field: {
      type: String,
      enum: fieldsEnum,
    },
    passoutYear: {
      type: Number,
      validate: {
        validator: function (value) {
          const currentYear = new Date().getFullYear();
          return value >= 1900 && value <= currentYear + 6;
        },
        message: (props) =>
          `${
            props.value
          } is not a valid passout year! It must be between 1900 and ${
            new Date().getFullYear() + 6
          }.`,
      },
    },
    visibility: {
      type: Boolean,
      default: true, // If false, the community is hidden from the multiverse
    },
    isInviteOnly: {
      type: Boolean, // If true, only people with invite link can join the community
      default: false,
    },
  },
  hiddenTags: {
    type: Array,
  },
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

module.exports = mongoose.model("Community", communitySchema);
