const mongoose = require("mongoose");
const jwt = require("jsonwebtoken")

const QuestProgressSchema = new mongoose.Schema({
    questId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Quest",
        required: true
    },

    // for discrete will stroe the number of entities completed like 3 clubs completed the target
    // for continuous will stroe the total value like 10 clubs created out of 30. Here 10 is the value
    
    value: {
        type: Number,
        default: 0
    },

    overallProgress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100,
    },
    isCompleted: {
        type: Boolean,
        default: false
    },

    completedAt: Date,

    isRewardClaimed: {
        type: Boolean,
        default: false
    },

    rewardClaimedAt: Date,

    lastUpdatedAt: {
        type: Date,
        default: Date.now
    }

}, { _id: false });

const universeSchema = new mongoose.Schema(
    {
        name: String,
        location: String,
        logo: String,
        callSign: String,
        logoKey: String,

        lat: {
            type: Number,
            default: 0,
            set: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0),
        },

        lng: {
            type: Number,
            default: 0,
            set: (v) => (Number.isFinite(Number(v)) ? Number(v) : 0),
        },
    },
    { _id: false },
);

const AddressSchema = new mongoose.Schema(
    {
        name: {
            type: String
        },
        phone: {
            type: String
        },
        addressLine1: {
            type: String,
            required: true
        },
        addressLine2: {
            type: String,
        },
        city: {
            type: String,
            required: true
        },
        state: {
            type: String,
            required: true
        },
        zip: {
            type: String,
            required: true
        },
        country: String,
    },
    { _id: true }
);

const ChapterLeaderSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            maxlength: 100,
        },
        email: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
            unique: true,
            index: true,
        },
        password: {
            type: String,
            required: true,
            minlength: 6,
            select: false,
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

        isVerified: {
            type: Boolean,
            default: false,
        },
        approvedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User"
        },
        uid: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Universe",
        },
        universeMetaData: universeSchema,
        refreshToken: {
            type: String,
        },
        passwordResetToken: {
            type: String,
        },
        passwordResetTokenExpire: {
            type: Date,
        },
        address : [
            AddressSchema
        ]
    },
    { timestamps: true }
);


ChapterLeaderSchema.methods.createAccessToken = function () {
    return jwt.sign(
        {
            role: "chapter_leader",
            id: this._id,
            uid: this.uid,
            callSign: this.universeMetaData?.callSign,
        },
        process.env.ACCESS_TOKEN_SECRET,
        {
            expiresIn: 60 * 25,
        },
    );
};

ChapterLeaderSchema.methods.createRefreshToken = function () {
    return jwt.sign(
        {
            role: "chapter_leader",
            id: this._id,
            uid: this.uid,
            callSign: this.universeMetaData?.callSign,
        },
        process.env.REFRESH_TOKEN_SECRET,
        {
            expiresIn: process.env.REFRESH_TOKEN_LIFETIME,
        },
    );
};

ChapterLeaderSchema.index({ uid: 1 });

module.exports = mongoose.model("ChapterLeader", ChapterLeaderSchema);