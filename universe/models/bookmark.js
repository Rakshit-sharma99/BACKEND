const mongoose = require("mongoose");

const bookmarkSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    contentId: {
        type: mongoose.Schema.Types.ObjectId,
        required: true,
    },
    contentType: {
        type: String,
        enum: ["content", "card", "event"],
        default: "content",
    },
    savedAt: {
        type: Date,
        default: Date.now,
    },
});

// For fetching user's bookmarks sorted by newest first
bookmarkSchema.index({ userId: 1, savedAt: -1 });

// Prevent duplicate bookmarks
bookmarkSchema.index({ userId: 1, contentId: 1 }, { unique: true });

module.exports = mongoose.model("Bookmark", bookmarkSchema);
