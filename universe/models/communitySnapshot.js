const mongoose = require("mongoose");

const communitySnapshotSchema = new mongoose.Schema(
    {
        communityId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Community",
            required: true,
        },
        memberCount: {
            type: Number,
            required: true,
            min: 0,
        },
        activeMembers: {
            type: Number,
            default: 0,
            min: 0,
        },
        snapshotDate: {
            type: Date,
            required: true,
            index: true,
        },
    },
    { timestamps: false }
);

// Compound index for fast lookups: "get snapshot for community X on date Y"
communitySnapshotSchema.index(
    { communityId: 1, snapshotDate: -1 },
    { unique: true }
);

module.exports = mongoose.model("CommunitySnapshot", communitySnapshotSchema);
