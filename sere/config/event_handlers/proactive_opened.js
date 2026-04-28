/**
 * Kafka handler for "proactive.opened" events.
 *
 * Fired when a user opens a Starman conversation that was
 * initiated by a proactive message. Updates tracking stats.
 */

const ProactiveMessage = require("../../models/proactiveMessage");
const UserEngagement = require("../../models/userEngagement");

const proactive_opened = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { userId, proactiveMessageId, sessionId } = data;

    if (!userId || !proactiveMessageId) {
      console.warn("⚠️ SERE: proactive.opened missing required fields, skipping.");
      return;
    }

    console.log(`📥 SERE: received [proactive.opened] for user ${userId}`);

    // Update ProactiveMessage
    await ProactiveMessage.findByIdAndUpdate(proactiveMessageId, {
      $set: {
        status: "opened",
        openedAt: new Date(),
      },
    });

    // Update engagement stats
    await UserEngagement.findOneAndUpdate(
      { userId },
      {
        $inc: { proactiveNudgesOpened: 1 },
      },
    );

    console.log(`👁️ SERE: proactive message ${proactiveMessageId} opened by user ${userId}`);
  } catch (error) {
    console.error("❌ SERE: error processing proactive.opened:", error.message);
  }
};

module.exports = { proactive_opened };
