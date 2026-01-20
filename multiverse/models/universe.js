const mongoose = require("mongoose");

const TicketTypeSchema = new mongoose.Schema(
  {
    type: String,
    price: Number,
    available: Number,
  },
  { _id: false },
);

const EventBelongsToSchema = new mongoose.Schema(
  {
    id: mongoose.Schema.Types.ObjectId,
    img: String,
    name: String,
  },
  { _id: false },
);

const EventSchema = new mongoose.Schema(
  {
    url: String,
    name: String,
    place: String,
    startTime: Date,
    endTime: Date,
    eventDate: Date,
    eventEndDate: Date,
    ticketAvailable: Boolean,
    ticketTypes: [TicketTypeSchema],
    belongsTo: EventBelongsToSchema,
  },
  { _id: false },
);

const BannerClubSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["club"],
      required: true,
    },
    _id: mongoose.Schema.Types.ObjectId,
    name: String,
    motto: String,
    tags: [String],
    featuringImg: String,
    secondaryImg: String,
  },
  { _id: false },
);

const BannerSchema = new mongoose.Schema(
  {
    data: [BannerClubSchema],
  },
  { _id: false },
);

const CommunityRecommendationSchema = new mongoose.Schema(
  {
    _id: mongoose.Schema.Types.ObjectId,
    title: String,
    secondaryCover: String,
  },
  { _id: false },
);

const LifecycleSchema = new mongoose.Schema(
  {
    launchingSoon: {
      type: Boolean,
      default: false,
    },
    launchDate: {
      type: Date,
    },
    isActive: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const UniverseSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    callSign: { type: String, required: true, unique: true },

    location: String,

    lat: Number,
    lng: Number,

    rank: Number,
    traffic: Number,
    clubs: Number,
    communities: Number,
    members: Number,

    ip: Number,

    logo: String,
    cover: String,
    logoKey: String,

    banner: BannerSchema,

    event: EventSchema,

    communitiesRecommendation: [CommunityRecommendationSchema],
    lifecycle: LifecycleSchema,
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Universe", UniverseSchema);
