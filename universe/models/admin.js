const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const adminSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['Content Team'],
  },
  name: {
    type: String,
    required: [true, 'Please provide the admin name.'],
  },
  email: {
    type: String,
    required: [true, 'Please provide the email id of the admin.'],
    match: [
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      'Please provide a valid email',
    ],
    unique: true,
  },
  password: {
    type: String,
    required: [true, 'Please provide the password of the admin.'],
  },
  image: {
    type: String,
    default: 'xyz.com',
  },
  adminKey: {
    type: String,
  },
  //gifts {uid:"",senderId:"",receiverId:"",status:enum["vendor","locker","dispatched"]}
  gifts: {
    type: Array,
  },
  clubs: {
    type: Array,
  },
  //notifications {key:"",value:"",data:}
  notifications: {
    type: Array,
  },
  unreadNotice: {
    type: Array,
  },
  unsortedWord: {
    type: Array,
  },
  //[{communityId}]
  communitiesCreated: {
    type: Array,
  },
  //[{communityId}]
  communitiesPartOf: {
    type: Array,
  },
  //[{communityId,contentId}]
  communityContribution: {
    type: Array,
  },
  //[{contentId,type:enum["community","club","gift","Macbease"]}]
  likedContents: {
    type: Array,
  },
  //[{contentId,type:enum["community","club","gift","Macbease"],comment}]
  commentedContents: {
    type: Array,
  },
  //[url]
  thrashUrls: {
    type: Array,
  },
  lastActive: {
    type: String,
  },
  refreshToken: {
    type: String,
  },
  reviewContent: {
    type: Array,
  },
  recoveryOtp: {
    type: Number,
  },
  pushToken: {
    type: String,
  },
});

adminSchema.methods.createAccessToken = function () {
  return jwt.sign(
    { role: 'admin', id: this._id },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: 60 * 25,
    }
  );
};

adminSchema.methods.createRefreshToken = function () {
  return jwt.sign(
    { role: 'user', id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: 60 * 60 * 24 * 30,
    }
  );
};

module.exports = mongoose.model('Admin', adminSchema);
