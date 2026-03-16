const mongoose = require("mongoose");

const semanticNodeSchema = new mongoose.Schema(
  {
    entityId: mongoose.Types.ObjectId,
    parentEntityId: mongoose.Types.ObjectId, // For multi-facet nodes (e.g. profile -> facets)

    uid: {
      type: String,
      index: true,
      required: true,
    },

    entityType: {
      type: String,
      enum: ["club", "community", "profile", "event", "profile_facet"],
      index: true,
    },

    facetId: String, // e.g. "coding", "fitness"

    text: String, // canonical text used for embedding

    embedding: {
      type: [Number], // 3072 dims
      index: false,
    },

    position: {
      x: {
        type: Number,
        index: true,
      },
      y: {
        type: Number,
        index: true,
      },
      zMin: {
        type: Number,
        index: true,
      },
      zMax: {
        type: Number,
        index: true,
      },
      importance: {
        type: Number,
        default: 0,
      },
    },

    meta: Object,

    embeddingModel: {
      type: String,
    },

    embeddedAt: {
      type: Date,
    },

    embeddingError: {
      type: String,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("SemanticNode", semanticNodeSchema);
