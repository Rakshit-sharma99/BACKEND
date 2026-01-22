const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const shortcutSchema = new mongoose.Schema(
  {
    id: {
      type: mongoose.Schema.Types.ObjectId,
      required: false,
    },

    type: {
      type: String,
      enum: ["club", "community", "people", "add_button"],
      required: true,
    },

    name: {
      type: String,
    },

    img: {
      type: String, // for people profile image
    },

    native: {
      type: Boolean,
      default: false,
    },

    secondary: {
      type: String,
    },

    secondaryImg: {
      type: String,
    },

    userPushToken: {
      type: String, // only for people
    },

    metaData: {
      messages: { type: Number, default: 0 },
      notifications: { type: Number, default: 0 },
      posts: { type: Number, default: 0 },
    },

    universeMetaData: {
      uid: String,
      name: String,
      callSign: String,
      location: String,
      logo: String,
      logoKey: String,
    },
  },
  { _id: false },
);

const userSchema = new mongoose.Schema(
  {
    profession: {
      type: String,
      enum: ["Student", "Professor", "Alumni"],
      default: "Student",
    },
    incompleteProfile: {
      type: Boolean,
      default: false,
    },
    role: {
      type: String,
      default: "Normal",
    },
    name: {
      type: String,
      required: [true, "Please provide the user name."],
    },
    reg: {
      type: Number,
    },
    course: {
      type: String,
    },
    field: {
      type: String,
    },
    passoutYear: {
      type: String,
    },
    level: {
      type: String,
    },
    email: {
      type: String,
      required: [true, "Please provide the email id."],
      match: [
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        "Please provide a valid email",
      ],
    },
    password: {
      type: String,
      required: [true, "Please provide the password."],
    },
    image: {
      type: String,
      default: "xyz.com",
    },
    cart: {
      type: Array,
    },
    reviewHistory: {
      type: Array,
    },
    cards: {
      type: Array,
    },
    chatRooms: {
      type: Array,
    },
    credibilityScore: {
      type: Number,
      default: 5,
    },
    //propOrder {id:"P-1",otp:8183,name:"Projector",time:"Night Shift",status:"Received"(enum["Yet to be dispatched","Dispatched"]),remark:"",logId:"",date:"",reviewed:false}
    propOrder: {
      type: Array,
    },
    giftsSend: {
      type: Array,
    },
    giftsReceived: {
      type: Array,
    },
    notifications: {
      type: Array,
    },
    unreadNotice: {
      type: Array,
    },
    //clubs you are part of...[{clubId}]
    clubs: {
      type: Array,
    },
    //blocked user from sending gifts ["user_id","user_id"]
    blockList: {
      type: Array,
    },
    likedCards: {
      type: Array,
    },
    //[{communityId}]
    communitiesCreated: {
      type: Array,
    },
    //[{communityId,bestStreak,currentStreak,lastPosted,totalLikes,totalPosts,rating}]
    communitiesPartOf: {
      type: Array,
    },
    //[{communityId,contentId}]
    communityContribution: {
      type: Array,
    },
    //[contentId]
    clubContributions: {
      type: Array,
    },
    //[{contentId,type:enum["community","club","gift","Macbease"]}]
    likedContents: {
      type: Array,
    },
    taggedContents: {
      type: Array,
    },
    //[{contentId,type:enum["community","club","gift","Macbease"],comment}]
    commentedContents: {
      type: Array,
    },
    //["Ai and Ml","Universe","Movies"]
    interests: {
      type: Array,
    },
    lastActive: {
      type: String,
    },
    recoveryOtp: {
      type: Number,
    },
    pushToken: {
      type: String,
    },
    //["id"]
    feed: {
      type: Array,
    },
    eventFeed: {
      type: Array,
    },
    //["id"]
    macbeaseContentContribution: {
      type: Array,
    },
    shortCuts: [shortcutSchema],
    ticketsBought: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticket",
      },
    ],
    refreshToken: { type: String },
    cardFeed: {
      type: Array,
    },
    badges: {
      type: Array,
    },
    deactivated: {
      type: Boolean,
      default: false,
    },
    deactivationDate: {
      type: Date,
    },
    pinnedBy: {
      type: Array,
    },
    tunedIn_By: {
      type: Array,
    },
    hasTunedTo: {
      type: Array,
    },
    creatorPost: {
      type: String,
    },
    resources: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Resource",
      },
    ],
    status: {
      type: String,
    },
    professionalEmail: {
      type: String,
    },
    incompleteFields: {
      type: Array,
    },
    career: {
      type: String,
    },
    company: {
      type: String,
    },
    workingPosition: {
      type: String,
    },
    orgId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Org",
    },
    appVersion: {
      type: String,
    },
    ip: {
      type: Number,
      default: 0,
    },
    a_recommended: [
      {
        type: {
          type: String,
          enum: ["Club", "Community", "Profile"],
          required: true,
        },
        id: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },
      },
    ],
    memoryRequests: {
      type: Array,
    },
    pinnedMemories: {
      type: Array,
    },
    memoryList: {
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
      lng: { type: Number }
    },
  },
  {
    timestamps: true,
  },
);

userSchema.methods.createAccessToken = function () {
  return jwt.sign(
    {
      role: "user",
      id: this._id,
      uid: this.uid,
      callSign: this.universeMetaData.callSign,
    },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: 60 * 25,
    },
  );
};

userSchema.methods.createRefreshToken = function () {
  return jwt.sign(
    {
      role: "user",
      id: this._id,
      uid: this.uid,
      callSign: this.universeMetaData.callSign,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_LIFETIME,
    },
  );
};

module.exports = mongoose.model("User", userSchema);
