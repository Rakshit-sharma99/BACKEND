const mongoose = require("mongoose");

// Sub-schema for universeMetaData
const UniverseMetaDataSchema = new mongoose.Schema(
  {
    name: String,
    location: String,
    logo: String,
    callSign: String,
  },
  { _id: false }
);

// Sub-schema for authorized person
const AuthorizedPersonSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    course: { type: String },
    image: { type: String },
    pushToken: { type: String },
    type: {
      type: String,
      enum: ["people"],
      default: "people",
    },
  },
  { _id: false }
);

// Sub-schema for belongsTo
const BelongsToSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Club"],
      default: "Club",
    },
    id: {
      type: String,
      required: true, // optional depending on your logic
    },
    img: {
      type: String,
    },
    name: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

// Sub-schema for FAQ
const FAQSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
    },
    ques: {
      type: String,
      required: true,
      trim: true,
    },

    ans: {
      type: String,
      trim: true,
    },

    predefined: {
      type: Boolean,
      default: false,
    },

    setAsPredefined: {
      type: Boolean,
      default: false,
    },

    seekerDetail: {
      name: { type: String },
      image: { type: String },
      id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      pushToken: { type: String },
    },

    answererDetail: {
      name: { type: String },
      image: { type: String },
      pushToken: { type: String },
      position: { type: String },
    },
  },
  { _id: false }
);

const eventSchema = new mongoose.Schema(
  {
    url: String,
    name: String,
    description: String,
    place: String,

    startTime: Date,
    endTime: Date,
    eventDate: Date,
    eventEndDate: Date,
    ticketDate: Date,

    postedBy: String,

    dl: { type: Boolean, default: false },
    ticketAvailable: { type: Boolean, default: false },

    ticketTypes: [
      {
        type: { type: String },
        price: { type: Number },
        available: { type: Number },
      },
    ],

    bookedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticket",
      },
    ],

    belongsTo: BelongsToSchema,

    status: {
      type: String,
      enum: ["pending", "featured", "past and unclear", "past and clear"],
      default: "pending",
    },

    amtPaid: { type: Number, default: 0 },
    amtPaidTo: { type: Number, default: 0 },

    ticketSellingDays: {
      type: [String],
      default: [],
    },

    cumulativeRevenue: {
      type: [Number],
      default: [],
    },

    courseAnalytics: [
      {
        course: String,
        count: Number,
      },
    ],

    faq: {
      type: [FAQSchema],
      default: [],
    },

    eventManagerMail: {
      type: String,
      match: /^\S+@\S+\.\S+$/,
      required: true,
    },

    eventManagerPhone: {
      type: String,
      match: /^[0-9]{10}$/, // Adjust regex for international formats if needed
    },

    authorizedPerson: AuthorizedPersonSchema,

    itineraries: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Itinerary",
      },
    ],

    uid: {
      type: String,
      trim: true,
    },

    universeMetaData: UniverseMetaDataSchema,
  },
  {
    timestamps: true,
  }
);

// Indexes
eventSchema.index({ uid: 1 });
eventSchema.index({ eventDate: 1 });
eventSchema.index({ "belongsTo.name": 1 });

module.exports = mongoose.model("Event", eventSchema);
