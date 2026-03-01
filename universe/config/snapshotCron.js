const cron = require("node-cron");
const Community = require("../models/community");
const CommunitySnapshot = require("../models/communitySnapshot");

/**
 * Takes a snapshot of all communities' member counts.
 * Designed to be called by the cron job, but exported for manual/one-time use.
 */
const takeSnapshot = async () => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0); // normalize to midnight

        const communities = await Community.find(
            {},
            { members: 1, activeMembers: 1 }
        ).lean();

        if (!communities || communities.length === 0) {
            console.log("📸 No communities found for snapshot.");
            return;
        }

        const bulkOps = communities.map((community) => ({
            updateOne: {
                filter: { communityId: community._id, snapshotDate: today },
                update: {
                    $set: {
                        memberCount: community.members ? community.members.length : 0,
                        activeMembers: community.activeMembers || 0,
                        snapshotDate: today,
                    },
                },
                upsert: true,
            },
        }));

        await CommunitySnapshot.bulkWrite(bulkOps);
        console.log(
            `📸 Community snapshot taken: ${communities.length} communities recorded.`
        );
    } catch (error) {
        console.error("❌ Error taking community snapshot:", error);
    }
};

// Run daily at midnight
cron.schedule("0 0 * * *", () => {
    console.log("⏰ Running daily community snapshot cron...");
    takeSnapshot();
});

// Take an initial snapshot on startup (if none exists for today)
(async () => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const existingSnapshot = await CommunitySnapshot.findOne({
            snapshotDate: today,
        }).lean();

        if (!existingSnapshot) {
            console.log("📸 No snapshot for today — taking initial snapshot...");
            await takeSnapshot();
        } else {
            console.log("📸 Snapshot for today already exists — skipping.");
        }
    } catch (error) {
        console.error("❌ Error checking for initial snapshot:", error);
    }
})();

module.exports = { takeSnapshot };
