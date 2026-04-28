/**
 * Kafka handler for "memory.created" events.
 *
 * When a user creates a memory, this handler:
 *   1. Marks memoryCreatedToday = true on UserEngagement
 *   2. Updates lastMemoryDate and increments memoryStreak
 *   3. Cancels any pending proactive nudge for this user
 */

const UserEngagement = require("../../models/userEngagement");
const ProactiveMessage = require("../../models/proactiveMessage");

const memory_created = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { userId, memoryId, type, uid } = data;

    if (!userId) {
      console.warn("⚠️ SERE: memory.created missing userId, skipping.");
      return;
    }

    console.log(`📥 SERE: received [memory.created] for user ${userId}`);

    // 1. Update engagement profile
    const engagement = await UserEngagement.findOne({ userId });

    if (engagement) {
      // Check if streak should increment or reset
      // Streak increments if last memory was yesterday or today
      let newStreak = 1;
      if (engagement.lastMemoryDate) {
        const lastDate = new Date(engagement.lastMemoryDate);
        const today = new Date();
        const daysDiff = Math.floor(
          (today.setHours(0, 0, 0, 0) - lastDate.setHours(0, 0, 0, 0)) /
            (1000 * 60 * 60 * 24),
        );

        if (daysDiff <= 1) {
          // Same day or consecutive day — increment
          newStreak = (engagement.memoryStreak || 0) + 1;
        }
        // daysDiff > 1 means streak broken, reset to 1
      }

      await UserEngagement.findOneAndUpdate(
        { userId },
        {
          $set: {
            memoryCreatedToday: true,
            lastMemoryDate: new Date(),
            memoryStreak: newStreak,
            // Reset ignore counter when user takes action
            consecutiveNudgeIgnores: 0,
          },
        },
      );
    } else {
      // Create engagement profile if it doesn't exist
      await UserEngagement.create({
        userId,
        uid,
        memoryCreatedToday: true,
        lastMemoryDate: new Date(),
        memoryStreak: 1,
      });
    }

    // 2. Cancel any pending/generated proactive nudge for this user today
    const cancelled = await ProactiveMessage.updateMany(
      {
        userId,
        status: { $in: ["pending", "generated"] },
      },
      { $set: { status: "cancelled_by_action" } },
    );

    if (cancelled.modifiedCount > 0) {
      console.log(
        `✅ SERE: cancelled ${cancelled.modifiedCount} pending nudge(s) for user ${userId} (memory created)`,
      );
    }

    console.log(`✅ SERE: memory tracking updated for user ${userId}`);
  } catch (error) {
    console.error("❌ SERE: error processing memory.created:", error.message);
  }
};

module.exports = { memory_created };
