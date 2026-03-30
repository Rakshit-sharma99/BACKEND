const mongoose = require("mongoose");
const { fieldsEnum, levelEnum } = require("../controllers/utils");

const communitySchema = new mongoose.Schema({
  creatorId: {
    type: String,
  },
  creatorPos: {
    type: String,
    enum: ["user", "admin"],
  },
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
  //[{contentId,irrelevanceVote}]
  content: {
    type: Array,
  },
  members: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
    },
  ],
  //["sports","coding"]
  tag: {
    type: Array,
  },
  activeMembers: {
    type: Number,
    default: 0,
  },
  unusedBadges: {
    type: Array,
  },
  usedBadges: {
    type: Array,
  },
  reviewBadges: {
    type: Array,
  },
  onlineMembers: {
    type: Array,
  },
  muted: {
    type: Array,
  },
  seeLessFeed: {
    type: Array,
  },
  pinnedBy: {
    type: Array,
  },
  postPermission: {
    type: Boolean,
    default: true,
    required: true,
  },
  shareLinkPermission: {
    type: Boolean,
    default: true,
    required: true,
  },
  approveMembership: {
    type: Boolean,
    default: false,
    required: true,
  },
  pendingRequests: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
    },
  ],
  admins: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
    },
  ],
  banList: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      unique: true,
    },
  ],
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
    name: { type: String },
    location: { type: String },
    logo: { type: String },
    callSign: { type: String },
    logoKey: { type: String },
    lat: { type: Number },
    lng: { type: Number },
  },
  scope: {
    type: [String],
    default: [],
  },
});
const Community = mongoose.model('Community', communitySchema);


module.exports = Community;
