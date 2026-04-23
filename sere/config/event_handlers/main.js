const { user_signup } = require("./user_signup");
const { user_activity } = require("./user_activity");
const { streak_update } = require("./streak_update");
const { query_deferred } = require("./query_deferred");
const { answer_resolved } = require("./answer_resolved");
const { live_notification } = require("./live_notification");

/**
 * Handler registry — maps Kafka topic names to handler functions.
 * The kafka_listener auto-subscribes to all keys in this object.
 *
 * SERE topics use dot notation (user.signup, user.activity, etc.)
 * rather than the prefix_suffix pattern used by other services,
 * because these are cross-service event topics, not service-scoped.
 */
const handlers = {
  "user.signup": user_signup,
  "user.activity": user_activity,
  "streak.update": streak_update,
  "query.deferred": query_deferred,
  "answer.resolved": answer_resolved,
  "live.notification": live_notification,
};

module.exports = { handlers };
