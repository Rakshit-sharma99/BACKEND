const cron = require("node-cron");
const User = require("../models/user");

/**
 * Removes entries from memoryBin that are older than 7 days.
 */
const cleanupMemoryBin = async () => {
  try {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    console.log(`⏰ Running memory bin cleanup for entries older than ${sevenDaysAgo.toISOString()}...`);

    const result = await User.updateMany(
      { "memoryBin.deletedAt": { $lt: sevenDaysAgo } },
      {
        $pull: {
          memoryBin: { deletedAt: { $lt: sevenDaysAgo } },
        },
      }
    );

    console.log(`✅ Memory bin cleanup completed. Modified ${result.modifiedCount} users.`);
  } catch (error) {
    console.error("❌ Error during memory bin cleanup:", error);
  }
};

// Run daily at midnight
cron.schedule("0 0 * * *", () => {
  console.log("⏰ Starting scheduled memory bin cleanup...");
  cleanupMemoryBin();
});

// Initial cleanup on startup
(async () => {
  await cleanupMemoryBin();
})();

module.exports = { cleanupMemoryBin };
