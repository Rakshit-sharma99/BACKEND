const mongoose = require("mongoose");

const payloadBaseSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "club",
        "community",
        "event",
        "profile",
        "filter",
        "advertisement",
      ],
      required: true,
    },
  },
  { _id: false, discriminatorKey: "type" }
);

const eventPayloadSchema = new mongoose.Schema(
  {
    eventId: { type: mongoose.Schema.Types.ObjectId, ref: "Event" },
  },
  { _id: false }
);

const clubPayloadSchema = new mongoose.Schema(
  {
    clubId: { type: mongoose.Schema.Types.ObjectId, ref: "Club" },
  },
  { _id: false }
);

const communityPayloadSchema = new mongoose.Schema(
  {
    communityId: { type: mongoose.Schema.Types.ObjectId, ref: "Community" },
  },
  { _id: false }
);

const profilePayloadSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  },
  { _id: false }
);

const filterPayloadSchema = new mongoose.Schema(
  {
    key: String,
    value: String,
    cover: String,
    lib: String,
    name: String,
  },
  { _id: false }
);

const advertisementPayloadSchema = new mongoose.Schema(
  {
    url: String,
    deeplink: String,
  },
  { _id: false }
);

payloadBaseSchema.discriminator("event", eventPayloadSchema);
payloadBaseSchema.discriminator("club", clubPayloadSchema);
payloadBaseSchema.discriminator("community", communityPayloadSchema);
payloadBaseSchema.discriminator("profile", profilePayloadSchema);
payloadBaseSchema.discriminator("filter", filterPayloadSchema);
payloadBaseSchema.discriminator("advertisement", advertisementPayloadSchema);

const blockSchema = new mongoose.Schema({
  pageName: {
    type: String,
    enum: ["home", "explore", "search"],
    required: true,
  },
  uiSignature: {
    type: String,
    enum: [
      "pagination",
      "generic_filters",
      "featured_events",
      "banner",
      "quadrant_filters",
      "top_clubs",
      "top_communities",
      "tile_filters",
      "past_events",
      "event_gallery",
      "people",
      "ad_pagination",
      "clubLeaderboard",
      "all_events",
      "communityLeaderboard",
      "cards",
      "upcoming_events",
      "event_highlights",
    ],
    required: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  payload: [payloadBaseSchema],
});

module.exports = mongoose.model("Block", blockSchema);
