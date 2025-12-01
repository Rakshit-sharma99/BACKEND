const mongoose = require('mongoose');

const resourceSchema = new mongoose.Schema(
  {
    submittedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    publisherMetaData: {
      name: {
        type: String,
        required: true,
      },
      image: {
        type: String,
        required: true,
      },
      pushToken: {
        type: String,
      },
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    url: {
      type: String,
    },
    access: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    accessList: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    metaData: {
      size: {
        type: Number,
        required: true,
      },
      uri: {
        type: String,
        required: true,
      },
      mimeType: {
        type: String,
        required: true,
      },
    },
    downloads: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    views: {
      type: Number,
      default: 0,
    },
    reviews: [
      {
        reviewId: {
          type: String,
        },
        userId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        timeStamp: {
          type: Date,
          default: Date.now,
        },
        msg: {
          type: String,
        },
        star: {
          type: Number,
          min: 1,
          max: 5,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model('Resource', resourceSchema);
