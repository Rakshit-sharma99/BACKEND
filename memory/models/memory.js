const mongoose = require("mongoose");

const tagSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ["people", "club", "community"],
    required: true,
  },
  name: String,
  title: String,
  image: String,
  secondaryImg: String,
  secondaryCover: String,
  _id: String,
});

const assetTagSchema = new mongoose.Schema(
  {
    user: {
      _id: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
      name: String,
      image: String,
    },
    x: Number,
    y: Number,
  },
  { _id: false }
);

const assetSchema = new mongoose.Schema(
  {
    userMetaData: {
      name: String,
      image: String,
    },
    type: {
      type: String,
      enum: ["image", "video"],
      required: true,
    },
    url: { type: String, required: true },
    tags: [assetTagSchema],
    postedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    downloadedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const memorySchema = new mongoose.Schema(
  {
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    savedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    type: {
      type: String,
      enum: ["media", "text", "a_event", "a_club"],
      required: true,
    },
    template: {
      type: String,
      enum: [
        "Friends",
        "Events",
        "Hostel",
        "Trip",
        "Sports",
        "Thoughts",
        "Clubs",
        null,
      ],
      default: null,
      required: false,
    },

    title: String,
    caption: {
      type: String,
      trim: true,
    },
    tags: [tagSchema],
    assets: [assetSchema],
    animation: {
      type: String,
      enum: ["promotion", "champion", "celebration"],
    },
    certificate: {
      type: String,
    },
    uploadEnabled: {
      type: Boolean,
      default: false,
    },
    date: {
      type: Date,
      default: Date.now,
      index: true,
    },
    visibility: {
      type: String,
      enum: ["private", "inThisMemory", "inMemoryList", "public"],
      default: "inThisMemory",
    },
    creatorMetaData: {
      name: String,
      image: String,
    },
    awardId: {
      type: String,
    },
    // enum values:["collage","mindspace", "polaroids"]
    carouselType: {
      type: String,
      enum: ["", "collage", "mindspace", "polaroids"],
      default: "",
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
  }
);

module.exports = mongoose.model("Memory", memorySchema);
