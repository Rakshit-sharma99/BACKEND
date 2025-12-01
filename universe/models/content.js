const mongoose = require("mongoose");

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
  //[{msg:"",id}]
  comments: {
    type: Array,
  },
  //[id]
  likes: {
    type: Array,
  },
  //["Technology","Sports"]
  tags: {
    type: Array,
  },
  sendBy: {
    type: String,
    enum: [
      "userGift",
      "club",
      "Macbease",
      "userGift",
      "admin",
      "userCommunity",
    ],
    required: [true, "Please provide who send the content."],
  },
  //id of the community or club it belongs to
  belongsTo: {
    type: String,
  },
  idOfSender: {
    type: String,
    required: [true, "Please provide the id of the sender."],
  },
  useful: {
    type: Boolean,
    default: true,
  },
  //an important note at the bottom of this page
  timeStamp: {
    type: Date,
    default: new Date(),
  },
  peopleTagged: {
    type: Array,
  },
  params: {
    type: Object,
  },
  metaData: {
    type: Object,
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
  vector: {
    type: Array,
  },
});

module.exports = mongoose.model("Content", contentSchema);

//When I was building clubs and community section, I needed every content to have a timeStamp so that I can find latest contents.
//There I had two options.Either I make changes in content schema or store timeStamp with content id in club and community schema itself
//I choose the second option which was a bad choice because I need timeStamp again for macbease content and it must be embedded
//with content schema itself. Though this decision caused bit of complexity but it will not cause any performance issues.
//In future we can optimize it. So remember that club and community do not use the timestamp of content schema
//but they have their own copy of timeStamp stored for each content.
