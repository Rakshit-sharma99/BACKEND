const mongoose = require("mongoose");

/* ---------- Sub Schemas ---------- */

// Representative texts inside a cluster
const representativeTextSchema = new mongoose.Schema(
  {
    type: {
      type: String, // e.g. "community"
      required: true,
    },
    score: {
      type: Number,
      required: true,
    },
    text: {
      type: String,
      required: true,
    },
  },
  { _id: false }
);

// Bounding box
const bboxSchema = new mongoose.Schema(
  {
    xMin: Number,
    yMin: Number,
    xMax: Number,
    yMax: Number,
  },
  { _id: false }
);

// GeoJSON-like geometry
const geometrySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["Polygon"],
      required: true,
    },
    coordinates: {
      type: [[[Number]]], // GeoJSON polygon format
      required: true,
    },
  },
  { _id: false }
);

// Spatial metadata
const spatialSchema = new mongoose.Schema(
  {
    center: {
      cx: Number,
      cy: Number,
    },
    radius: Number,
    bbox: bboxSchema,
    geometry: geometrySchema,
    zMin: Number,
    zMax: Number,
  },
  { _id: false }
);

/* ---------- Main Cluster Schema ---------- */

const territorySchema = new mongoose.Schema(
  {
    clusterId: {
      type: Number,
      required: true,
      index: true,
      unique: true,
    },

    memberNodeIds: {
      type: [String], // references to nodes / communities
      default: [],
    },

    centroidEmbedding: {
      type: [Number], // vector embedding
      default: [],
      select: false, // 🔑 hide by default (important for performance)
    },

    size: {
      type: Number,
      required: true,
    },

    representativeTexts: {
      type: [representativeTextSchema],
      default: [],
    },

    name: {
      type: String,
      required: true,
    },

    aliases: {
      type: [String],
      default: [],
    },

    description: {
      type: String,
    },

    tags: {
      type: [String],
      index: true,
    },

    rawImportance: {
      type: Number,
    },

    importanceScore: {
      type: Number,
      index: true,
    },

    spatial: spatialSchema,
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("Territory", territorySchema);