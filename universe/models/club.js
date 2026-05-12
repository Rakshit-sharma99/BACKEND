const mongoose = require("mongoose");

const awardRefSchema = new mongoose.Schema(
  {
    awardId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Award",
      required: true,
    },
    count: {
      type: Number,
      default: 1,
      min: 0,
    },
  },
  { _id: false },
);

const gallerySchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: true,
      trim: true,
    },

    id: {
      type: String,
      required: true,
    },

    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    desc: {
      type: String,
      trim: true,
      maxlength: 500,
    },

    date: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const clubSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Please provide the name of the club."],
    },
    motto: {
      type: String,
      required: [true, "Please provide the motto of the club."],
    },
    tags: [{ type: String, trim: true }],
    featuringImg: {
      type: String,
      required: [true, "Please provide the motto of the club."],
    },
    secondaryImg: {
      type: String,
    },
    gallery: {
      type: [gallerySchema],
      default: [],
    },
    //array of objects {url:"xyz.com",id:"ff232"}
    videos: {
      type: Array,
    },
    //array of objects {id:"r3039fjf",url:"url",name:"eventName2023",description:"OneLiner",place:"sdma",time:"tomorrow 3pm to 5pm",postedBy:"idOfAdmin"}
    upcomingEvent: {
      type: Array,
    },
    //array of objects {id:"f34ef23",pos:"ceo"}
    team: {
      type: Array,
    },
    //array of number of members
    xAxisData: {
      type: Array,
      default: [0],
    },
    //array of dates
    yAxisData: {
      type: Array,
      default: [0],
    },
    members: {
      type: Array,
    },
    adminId: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    mainAdmin: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    //[{id:"",msg:""}]
    notifications: {
      type: Array,
    },
    //[{contentId:"",postedBy:"adminId"}]
    content: {
      type: Array,
    },
    rating: {
      type: Number,
    },
    createdOn: {
      type: Date,
      default: new Date(),
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
    proposalHistory: {
      type: Array,
    },
    undecidedProposals: {
      type: Array,
    },
    pinnedBy: {
      type: Array,
    },
    permissions: {
      whoCanPost: {
        type: [String],
        default: [],
      },
      whoCanAcceptProposals: {
        type: [String],
        default: [],
      },
      chatModerators: {
        type: [String],
        default: [],
      },
      whoCanSendNotifications: {
        type: [String],
        default: [],
      },
      whoCanDispatchAwards: {
        type: [String],
        default: [],
      },
      whoCanAccessWallet: {
        type: [String],
        default: [],
      },
    },
    memoryRequests: {
      type: Array,
    },
    awards: {
      type: [awardRefSchema],
      default: [],
    },
    processedPayments: {
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
  },
  { timestamps: true },
);

module.exports = mongoose.model("Club", clubSchema);
