/**
 * Kafka handler for "proactive.replied" events.
 *
 * Fired when a user replies to a proactive Starman message.
 * This is the strongest engagement signal — resets ignore counter.
 */

const ProactiveMessage = require("../../models/proactiveMessage");
const UserEngagement = require("../../models/userEngagement");

const proactive_replied = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { userId, proactiveMessageId, sessionId } = data;

    if (!userId || !proactiveMessageId) {
      console.warn("⚠️ SERE: proactive.replied missing required fields, skipping.");
      return;
    }

    console.log(`📥 SERE: received [proactive.replied] for user ${userId}`);

    // Update ProactiveMessage
    await ProactiveMessage.findByIdAndUpdate(proactiveMessageId, {
      $set: {
        status: "replied",
        repliedAt: new Date(),
      },
    });

    // Update engagement stats — reply is the strongest signal
    await UserEngagement.findOneAndUpdate(
      { userId },
      {
        $inc: { proactiveNudgesReplied: 1 },
        $set: {
          consecutiveNudgeIgnores: 0, // reset ignore counter
          lastActiveAt: new Date(),
        },
      },
    );

    console.log(`💬 SERE: proactive message ${proactiveMessageId} replied by user ${userId}`);
  } catch (error) {
    console.error("❌ SERE: error processing proactive.replied:", error.message);
  }
};

module.exports = { proactive_replied };
