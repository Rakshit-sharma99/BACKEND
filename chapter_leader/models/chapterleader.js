const mongoose = require("mongoose");

const QuestProgressSchema = new mongoose.Schema(
    {
        questId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Quest",
            required: true,
        },
        overallProgress: {
            type: Number,
            default: 0,
            min: 0,
            max: 100,
        },
        // length will be equal to the number of entities in that quest like 3 club then length is 3
        current: [
            {
                type: Number,
                default: 0,
                min: 0,
            }
        ], 
        target: [
            {
                type: Number,
                required: true,
            }
        ],
        isCompleted: {
            type: Boolean,
            default: false,
        },
        completedAt: {
            type: Date,
            default: null,
        },

        isRewardClaimed: {
            type: Boolean,
            default: false,
        },
        rewardClaimedAt: {
            type: Date,
            default: null,
        },
        lastUpdatedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: false }
);

const ChapterLeaderSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            index: true,
        },
        password: {
            type: String,
            required: true,
        },
        progress: {
            type: [QuestProgressSchema],
            default: [],
        },
        totalIpEarned: {
            type: Number,
            default: 0,
            min: 0,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
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
        }
    },
    { timestamps: true }
);

ChapterLeaderSchema.index({ uid: 1, isActive: 1 });

module.exports = mongoose.model("ChapterLeader", ChapterLeaderSchema);