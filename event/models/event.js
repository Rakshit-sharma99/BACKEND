const mongoose = require("mongoose");
const slugify = require("slugify");

// Sub-schema for universeMetaData
const UniverseMetaDataSchema = new mongoose.Schema(
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
  { _id: false },
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
  { _id: false },
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
  { _id: false },
);

const postProductionSchema = new mongoose.Schema(
  {
    bills: {
      type: [String],
      default: [],
    },
    reminder1: {
      type: Boolean,
      default: false,
    },
    reminder2: {
      type: Boolean,
      default: false,
    },
    autoGen: {
      type: Boolean,
      default: false,
    },
  },
  { _id: false },
);

const eventSchema = new mongoose.Schema(
  {
    url: String,
    name: String,
    slug: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
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
        _id: String,
        type: { type: String, required: true },
        price: { type: Number },
        available: { type: Number },
        extraFieldsRequired: { type: Boolean, default: false },
        extraFields: { type: Array, default: [] },
        visibility: {
          scope: {
            type: String,
            enum: [
              "public",
              "club_members",
              "club_admins",
              "club_core",
              "native",
              "private_code",
              "users_list"
            ],
            default: "public",
          },
          uids: [String], // if scope is native and want to allow specific universities
          n_uids: [String], // if scope if public and want to restrict specific universities
          privateCodes: [   // if scope is private_code and want to allow specific users with private codes
            {
              type: String,
            }
          ],
          usersList: [  // if scope is users_list and want to allow specific users
            {
              type: mongoose.Schema.Types.ObjectId,
              ref: "User",
            },
          ],
        },
        customLabel: { type: String }
      },
    ],

    bookedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Ticket",
      },
    ],

    waitlist: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    belongsTo: BelongsToSchema,

    status: {
      type: String,
      enum: [
        "expired",
        "pending",
        "featured",
        "past and unclear",
        "past and clear",
      ],
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
    extraFieldsRequired: {
      type: Boolean,
      default: false,
    },
    extraFields: [
      {
        fieldName: { type: String, required: true },
        type: {
          type: String,
          enum: ["String", "Number", "Boolean", "Date", "Enum", "Doc"],
          required: true,
        },
        enumValues: {
          type: [String], // Ensures it's an array of strings
          default: undefined, // So it's omitted if not set
        },
        placeholder: {
          type: String,
        },
        mandatory: {
          type: Boolean,
        },
        regex: {
          type: String,
        },
        maxSelection: {
          type: Number,
        },
      },
    ],
    isPromoted: { type: Boolean, default: false },
    promotionLevel: { type: Number, default: 0 },
    promotionExpiry: { type: Date },
    permissions: {
      whoCanSeeStats: {
        type: [String],
        default: [],
      },
      whoCanScanTickets: {
        type: [String],
        default: [],
      },
      whoCanEditEvent: {
        type: [String],
        default: [],
      },
      whoCanAnswerFAQ: {
        type: [String],
        default: [],
      },
    },
    gallery: [
      {
        type: {
          type: String,
          enum: ["image", "video"],
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
        tags: [
          {
            x: { type: Number, required: true },
            y: { type: Number, required: true },
            user: {
              _id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                required: true,
              },
              name: { type: String, required: true },
              image: { type: String },
            },
          },
        ],
        postedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        userMetaData: {
          name: String,
          image: String,
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        downloadedBy: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
          },
        ],
        featured: {
          type: Boolean,
          default: false,
        },
      },
    ],
    memoriesUploaded: {
      type: Boolean,
      default: false,
    },
    tags: {
      type: Array,
    },
    postProduction: {
      type: postProductionSchema,
      default: () => ({}),
    },
    platformFeeEnabled: {
      type: Boolean,
      default: false,
    },
    platformFee: {
      type: Number,
      default: 2.5,
    },

    layoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Layout"
    },

    seatsBooked: {
      type: [String],
      default: []
    },
    // documents of rules or instructions for participants
    attachment: {
      type: String
    },

    pastMoments: [
      {
        type: {
          type: String,
          enum: ["image", "video"],
          required: true,
        },
        url: {
          type: String,
          required: true,
        },
      }
    ],

    uid: {
      type: String,
      trim: true,
    },

    universeMetaData: UniverseMetaDataSchema,
  },
  {
    timestamps: true,
  },
);

eventSchema.pre("save", function (next) {
  if (this.isModified("name")) {
    this.slug = slugify(this.name, {
      lower: true,
      strict: true,
    });
  }
  next();
});

// Indexes
eventSchema.index({ uid: 1 });
eventSchema.index({ eventDate: 1 });
eventSchema.index({ "belongsTo.name": 1 });

module.exports = mongoose.model("Event", eventSchema);
