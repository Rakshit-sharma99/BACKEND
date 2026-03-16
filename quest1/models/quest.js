const mongoose = require("mongoose");

const QUEST_METRICS = [
    "clubs_created",
    "clubs_with_min_members",
    "clubs_with_min_events",
    "clubs_with_min_posts",
    "total_club_members",
    "total_club_posts",

    "communities_created",
    "communities_with_min_members",
    "communities_with_min_events",
    "communities_with_min_posts",
    "total_community_members",
    "total_community_posts",
];

const ENTITY_TYPES = ["club", "community", "event", "member"];

const TargetConfigSchema = new mongoose.Schema(
    {
        minMembers: { type: Number, min: 1, default: null },
        minEvents: { type: Number, min: 1, default: null },
        minPosts: { type: Number, min: 1, default: null },
        minLikes: { type: Number, min: 1, default: null },
        minComments: { type: Number, min: 1, default: null },
    },
    { _id: false }
);

const QuestTargetSchema = new mongoose.Schema(
    {
        entities: {
            type: Number,
            required: true,
            min: 1,
        },
        entity: {
            type: String,
            enum: ENTITY_TYPES,
            required: true,
        },
        config: {
            type: TargetConfigSchema,
            default: () => ({}),
        },
    },
    { _id: false }
);

const QuestSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
            maxlength: 120,
        },
        description: {
            type: String,
            required: true,
            trim: true,
            maxlength: 1000,
        },
        logo: {
            type: String,
            required: true,
            trim: true,
        },
        ip: {
            type: Number,
            required: true,
            min: 0,
        },

        metric: {
            type: String,
            enum: QUEST_METRICS,
            required: true,
            trim: true,
        },

        target: {
            type: QuestTargetSchema,
            required: true,
        },

        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },

        isRepeatable: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

QuestSchema.index({ metric: 1, isActive: 1 });

module.exports = {
    Quest: mongoose.model("Quest", QuestSchema),
    QUEST_METRICS,
    ENTITY_TYPES
}