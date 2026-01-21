const mongoose = require("mongoose");

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
  replies: [
    {
      rid: String,
      text: String,
      name: String,
      img: String,
      pushToken: String,
      course: String,
      timeStamp: Date,
      _id: false,
    },
  ],
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
  c_url: {
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
      },
      { _id: false }
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
      { _id: false }
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
  vector: [Number], // Assuming vector is an array of floats
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
  timeStamp: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("Content", contentSchema);
