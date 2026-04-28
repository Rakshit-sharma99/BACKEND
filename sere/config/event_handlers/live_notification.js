/**
 * Kafka handler for "live.notification" events.
 *
 * Receives notifications from any backend service and routes them
 * through the dispatcher for presence-aware, real-time delivery.
 */

const {
  validateLiveNotification,
  applyDefaults,
} = require("../utils/liveNotificationSchema");
const { dispatch } = require("../../services/liveNotificationDispatcher");

/**
 * Handler for live.notification Kafka topic.
 *
 * @param {string} messageValue — raw Kafka message value (JSON string)
 */
const live_notification = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);

    console.log(`[DEBUG-PROD-LIVE] SERE: Kafka Consumer received [live.notification] for targetUserId: ${data.targetUserId}`);
    console.log(`📥 SERE: received [live.notification]`, {
      targetUserId: data.targetUserId,
      type: data.notification?.type,
    });

    // Validate payload
    validateLiveNotification(data);

    // Apply defaults
    const notification = applyDefaults(data.notification);

    // Dispatch to the user
    await dispatch(data.targetUserId, notification);
  } catch (error) {
    console.error(
      `❌ SERE: error processing live.notification:`,
      error.message,
    );
  }
};

module.exports = { live_notification };
