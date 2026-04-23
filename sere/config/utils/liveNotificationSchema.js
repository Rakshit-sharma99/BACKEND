/**
 * Live Notification Schema — standardized payload validation.
 *
 * Any service emitting to the "live.notification" Kafka topic
 * must conform to this schema.
 */

const VALID_TYPES = [
  "dm",
  "mention",
  "share",
  "club_post",
  "community_announcement",
  "event_update",
  "reaction",
  "follow",
  "system",
];

const VALID_PRIORITIES = ["low", "normal", "high"];

/**
 * Validate a live notification Kafka message.
 * Throws if invalid.
 *
 * @param {object} data — the full Kafka message value (parsed JSON)
 */
function validateLiveNotification(data) {
  if (!data.targetUserId || typeof data.targetUserId !== "string") {
    throw new Error("live.notification: 'targetUserId' is required and must be a string");
  }

  const n = data.notification;
  if (!n || typeof n !== "object") {
    throw new Error("live.notification: 'notification' object is required");
  }

  if (!n.type || !VALID_TYPES.includes(n.type)) {
    throw new Error(
      `live.notification: 'notification.type' must be one of: ${VALID_TYPES.join(", ")}`,
    );
  }

  if (!n.title || typeof n.title !== "string") {
    throw new Error("live.notification: 'notification.title' is required");
  }

  if (!n.body || typeof n.body !== "string") {
    throw new Error("live.notification: 'notification.body' is required");
  }

  // Optional field type checks (allow null or undefined)
  if (n.image != null && typeof n.image !== "string") {
    throw new Error("live.notification: 'notification.image' must be a string");
  }

  if (n.ttl != null && typeof n.ttl !== "number") {
    throw new Error("live.notification: 'notification.ttl' must be a number (ms)");
  }

  if (n.priority != null && !VALID_PRIORITIES.includes(n.priority)) {
    throw new Error(
      `live.notification: 'notification.priority' must be one of: ${VALID_PRIORITIES.join(", ")}`,
    );
  }

  if (n.action != null && typeof n.action !== "object") {
    throw new Error("live.notification: 'notification.action' must be an object");
  }

  if (n.metadata != null && typeof n.metadata !== "object") {
    throw new Error("live.notification: 'notification.metadata' must be an object");
  }

  if (n.groupKey != null && typeof n.groupKey !== "string") {
    throw new Error("live.notification: 'notification.groupKey' must be a string");
  }
}

/**
 * Apply defaults to a notification payload.
 */
function applyDefaults(notification) {
  return {
    ...notification,
    ttl: notification.ttl ?? 10000,
    priority: notification.priority ?? "normal",
    metadata: notification.metadata ?? {},
  };
}

module.exports = {
  validateLiveNotification,
  applyDefaults,
  VALID_TYPES,
  VALID_PRIORITIES,
};
