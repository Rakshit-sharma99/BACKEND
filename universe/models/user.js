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

    lat: {
      type: Number,
      default: 0,
      set: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0),
    },

    lng: {
      type: Number,
      default: 0,
      set: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0),
    },
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
      required: false,
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
        "community",
        "likedACard",
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

const likedContentsSchema = new mongoose.Schema(
  {
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    type: {
      type: String,
      enum: [
        "usercommunity",
        "club",
        "Macbease",
        "community",
        "macbease",
        "Club",
      ],
      required: true,
    },
  },
  { _id: false },
);

const taggedContentsSchema = new mongoose.Schema(
  {
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    type: {
      type: String,
      enum: ["community", "club", "macbease"],
      required: true,
    },
  },
  { _id: false },
);

const commentedContentsSchema = new mongoose.Schema(
  {
    contentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    type: {
      type: String,
      enum: ["community", "club", "macbease"],
      required: true,
    },
    cid: {
      type: String,
      required: true,
    },
  },
  { _id: false },
);

const feedSchema = new mongoose.Schema(
  {
    _id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
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

const assetItemSchema = new mongoose.Schema({
  assetId: {
    type: String,
    required: true,
  },
  x: { type: Number, default: 0 },
  z: { type: Number, default: 0 },
  dx: { type: Number, default: 0 },
  dy: { type: Number, default: 0 },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
});

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

    gender: {
      type: String,
      enum: ["she_her", "he_him", "they_them", "custom"],
    },

    name: {
      type: String,
      unique: true,
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

    clubContributions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Content",
      },
    ],

    likedContents: [likedContentsSchema],

    taggedContents: [taggedContentsSchema],

    commentedContents: [commentedContentsSchema],

    interests: {
      type: [String],
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

    feed: [feedSchema],

    eventFeed: [
      {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    ],

    shortCuts: [shortcutSchema],

    ticketsBought: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticket",
      },
    ],

    refreshTokens: {
      app: { type: String, default: null },
      web: { type: String, default: null },
    },

    cardFeed: [
      {
        type: mongoose.Schema.Types.Mixed,
        default: {},
      },
    ],

    badges: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Badge",
      },
    ],

    deactivated: {
      type: Boolean,
      default: false,
    },

    deactivationDate: {
      type: Date,
    },

    pinnedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    tunedIn_By: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticket",
      },
    ],

    hasTunedTo: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticket",
      },
    ],

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
      enum: ["offline", "online"],
      default: "offline",
    },

    professionalEmail: {
      type: String,
      unique: true,
      match: [
        /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
        "Please provide a valid email",
      ],
    },

    emailVerified: {
      type: Boolean,
      default: false,
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

    memoryRequests: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Memory",
      },
    ],

    pinnedMemories: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Memory",
      },
    ],

    memoryList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    uid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Universe",
    },

    vicinityAsset: [assetItemSchema],

    universeMetaData: universeSchema,

    channels: [
      {
        channelId: {
          type: mongoose.Schema.Types.ObjectId,
          required: true,
        },

        role: {
          type: String,
          enum: ["admin", "team", "member"],
          default: "member",
        },

        rooms: [String],
      },
    ],
  },
  {
    timestamps: true,
  },
);

userSchema.index({ "channels.channelId": 1 });

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
