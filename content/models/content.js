const mongoose = require("mongoose");

const universeMetaDataSchema = new mongoose.Schema(
  {
    name: { type: String },
    location: { type: String },
    logo: { type: String },
    callSign: { type: String },
    logoKey: { type: String },
    lat: { type: Number },
    lng: { type: Number },
  },
  { _id: false },
);

const commentSchema = new mongoose.Schema({
  cid: {
    type: String,
    // unique: true,
  },
  text: {
    type: String,
    required: true,
    trim: true,
  },
  peopleTagged: [
    {
      _id: String,
      name: String,
      image: String,
    },
  ],
  likes: [String],
  name: {
    type: String,
    required: true,
  },
  img: {
    type: String,
  },
  pushToken: {
    type: String,
  },
  _id: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  timeStamp: {
    type: Date,
    default: Date.now,
  },
  replies: [
    {
      rid: String,
      text: String,
      name: String,
      img: String,
      pushToken: String,
      course: String,
      timeStamp: Date,
      userId: String,
      _id: false,
    },
  ],
  uid: {
    type: String,
  },
  universeMetaData: universeMetaDataSchema,
});

const contentSchema = new mongoose.Schema({
  contentType: {
    type: String,
    enum: ["text", "image", "video", "doc"],
    required: [true, "Please provide the content type."],
  },
  url: {
    type: String,
  },
  altTexts: {
    type: [String],
    default: [],
  },
  c_url: {
    type: String,
  },
  title: {
    type: String,
  },
  text: {
    type: String,
  },
  comments: [commentSchema],
  likes: [String],
  tags: [String],
  sendBy: {
    type: String,
    enum: ["club", "userCommunity"],
    required: [true, "Please provide who sent the content."],
  },
  belongsTo: {
    type: String,
  },
  idOfSender: {
    type: String,
    required: [true, "Please provide the ID of the sender."],
  },
  useful: {
    type: Boolean,
    default: true,
  },
  peopleTagged: [
    {
      _id: String,
      name: String,
      image: String,
    },
  ],
  params: {
    type: new mongoose.Schema(
      {
        userName: String,
        userPic: String,
        userPushToken: String,
        clubTitle: String,
        clubCover: String,
        communityTitle: String,
        communityCover: String,
        uid: String,
        universeMetaData: universeMetaDataSchema,
      },
      { _id: false },
    ),
  },
  metaData: {
    type: new mongoose.Schema(
      {
        size: Number,
        name: String,
        uri: String,
        mimeType: String,
      },
      { _id: false },
    ),
  },
  underReview: {
    type: Boolean,
    default: false,
  },
  discretion: {
    type: String,
  },
  blur: {
    type: Boolean,
    default: false,
  },
  bookmarkCount: {
    type: Number,
    default: 0,
    min: 0,
  },
  vector: [Number], // Assuming vector is an array of floats
  uid: {
    type: String,
  },
  universeMetaData: universeMetaDataSchema,
  externalSourceMetaData: {
    type: new mongoose.Schema(
      {
        entityId: { type: String },           // WhatsApp JID / Discord channel ID
        entityName: { type: String },         // "CS301 Class Group"
        platform: { type: String, enum: ["whatsapp", "discord", "telegram"] },
        category: { type: String, enum: ["deadlines", "announcements", "resources", "decisions", "summaries"] },
        originalText: { type: String },       // Raw text before LLM rewrite
        relayScore: { type: Number },         // 0.0–1.0 relevance score
        relayedBy: { type: String },          // "starman-bot"
      },
      { _id: false }
    ),
  },
  timeStamp: {
    type: Date,
    default: Date.now,
  },
});

// Indexes for Feed Generation Strategy
contentSchema.index({ belongsTo: 1, timeStamp: -1 }); // For Followed Content
contentSchema.index({ tags: 1, timeStamp: -1 }); // For Suggested Content
contentSchema.index({ timeStamp: -1 }); // Global fallback

module.exports = mongoose.model("Content", contentSchema);
