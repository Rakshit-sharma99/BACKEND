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
      type: String,
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
      type: String,
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

const universeSchema = new mongoose.Schema(
  {
    name: String,
    location: String,
    logo: String,
    callSign: String,
    logoKey: String,
    lat: Number,
    lng: Number,
  },
  { _id: false },
);

const chatRoomSchema = new mongoose.Schema(
  {
    doc_id: {
      type: String,
      required: true,
    },

    state: {
      type: String,
      enum: ["read", "unread"],
      default: "unread",
    },

    metaData: {
      name: { type: String },
      image: { type: String },
      pushToken: { type: String },
      deactivated: { type: Boolean, default: false },
    },

    status: {
      type: String,
      enum: ["pending", "accepted", "declined"],
      default: "pending",
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  { _id: false },
);

const notificationSchema = new mongoose.Schema(
  {
    uid: {
      type: String,
      required: true,
    },
    value: {
      type: String,
      required: true,
    },

    img1: {
      type: String,
    },

    img2: {
      type: String,
    },

    key: {
      type: String,
      enum: [
        "like",
        "content",
        "msg",
        "event",
        "tag",
        "letter",
        "read",
        "badge",
        "invitation",
        "memory",
        "certificate",
        "read",
      ],
      required: false,
    },

    action: {
      type: String,
    },

    contentType: {
      type: String,
    },

    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    contentMetaData: {
      type: mongoose.Schema.Types.Mixed,
    },

    time: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const communitiesCreatedSchema = new mongoose.Schema(
  {
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
    },
  },
  { _id: false },
);

const communitiesPartOfSchema = new mongoose.Schema(
  {
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
    },

    bestStreak: {
      type: Number,
      default: 0,
      min: 0,
    },

    currentStreak: {
      type: Number,
      default: 0,
      min: 0,
    },

    lastPosted: {
      type: Date,
    },

    totalLikes: {
      type: Number,
      default: 0,
      min: 0,
    },

    totalPosts: {
      type: Number,
      default: 0,
      min: 0,
    },

    rating: {
      type: Number,
      default: 0,
      min: 0,
    },

    joined: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false },
);

const communityContributionSchema = new mongoose.Schema(
  {
    communityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Community",
      required: true,
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Content",
      required: true,
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
      enum: ["Creator", "Normal"],
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
      unique: true,
    },
    password: {
      type: String,
      required: [true, "Please provide the password."],
    },
    image: {
      type: String,
      default: "xyz.com",
    },
    cards: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Card",
      },
    ],

    chatRooms: [chatRoomSchema],

    notifications: [notificationSchema],

    unreadNotice: [notificationSchema],

    clubs: [
      {
        clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club" },
        joinDate: Date,
        badges: [String],
      },
    ],
    //blocked user from sending gifts ["user_id","user_id"]
    blockList: {
      type: Array,
    },
    likedCards: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Card",
      },
    ],

    communitiesCreated: [communitiesCreatedSchema],

    communitiesPartOf: [communitiesPartOfSchema],

    communityContribution: [communityContributionSchema],

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
      type: Date,
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
      min: 0,
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
    universeMetaData: universeSchema,
  },
  {
    timestamps: true,
  },
);

userSchema.set("toJSON", {
  transform: function (doc, ret) {
    delete ret.password;
    delete ret.refreshToken;
    return ret;
  },
});

userSchema.methods.createAccessToken = function () {
  return jwt.sign(
    {
      role: "user",
      id: this._id,
      uid: this.uid,
      callSign: this.universeMetaData?.callSign,
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
      callSign: this.universeMetaData?.callSign,
    },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: process.env.REFRESH_TOKEN_LIFETIME,
    },
  );
};

module.exports = mongoose.model("User", userSchema);
