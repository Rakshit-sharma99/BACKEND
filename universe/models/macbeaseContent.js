const mongoose = require('mongoose');

const macbeaseContentSchema = new mongoose.Schema({
  contentType: {
    type: String,
    enum: ['text', 'image', 'video', 'doc'],
    required: [true, 'Please provide the content type.'],
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
    enum: ['Macbease'],
    required: [true, 'Please provide who send the content.'],
  },
  //id of the community or club it belongs to
  belongsTo: {
    type: String,
  },
  idOfSender: {
    type: String,
    required: [true, 'Please provide the id of the sender.'],
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
});

module.exports = mongoose.model('MacbeaseContent', macbeaseContentSchema);
