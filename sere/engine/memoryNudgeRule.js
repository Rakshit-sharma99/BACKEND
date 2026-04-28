/**
 * Memory Nudge Rule — Eligibility logic for proactive memory nudges.
 *
 * Determines if a user should receive a proactive Starman message
 * nudging them to create a memory for the day.
 *
 * Eligibility criteria:
 *   1. User has NOT created a memory today
 *   2. User has NOT been sent a proactive nudge today
 *   3. User has NOT opted out of proactive messages
 *   4. consecutiveNudgeIgnores < threshold
 *   5. Not within ignore cooldown period
 *   6. User signed up at least 2 days ago
 *   7. No other SERE reminder sent in last 4 hours
 */

const ProactiveMessage = require("../models/proactiveMessage");

// ── Constants ──
const PROACTIVE_CONFIG = {
  MAX_NUDGES_PER_DAY: 1,
  EVENING_WINDOW_START: 19,        // 7 PM local
  EVENING_WINDOW_END: 21,          // 9 PM local
  CONSECUTIVE_IGNORE_THRESHOLD: 3, // pause after 3 ignored nudges
  IGNORE_COOLDOWN_DAYS: 3,         // wait 3 days after hitting threshold
  MESSAGE_EXPIRY_HOURS: 12,        // message expires next morning
  MIN_DAYS_SINCE_SIGNUP: 2,        // don't nudge brand-new users
  MIN_GAP_BETWEEN_ANY_REMINDER_HOURS: 4,
};

/**
 * Check if a user is eligible for a proactive memory nudge.
 *
 * @param {object} engagement - UserEngagement document
 * @returns {{ eligible: boolean, reason: string }}
 */
function checkEligibility(engagement) {
  // 1. Opted out of proactive messages
  if (engagement.proactiveOptOut) {
    return { eligible: false, reason: "proactive_opt_out" };
  }

  // 2. Opted out of all reminders
  if (engagement.optedOut) {
    return { eligible: false, reason: "all_reminders_opted_out" };
  }

  // 3. Already created a memory today
  if (engagement.memoryCreatedToday) {
    return { eligible: false, reason: "memory_already_created" };
  }

  // 4. Already sent a proactive nudge today
  if (engagement.lastProactiveNudgeAt) {
    const lastNudge = new Date(engagement.lastProactiveNudgeAt);
    const now = new Date();
    const hoursSinceLastNudge = (now - lastNudge) / (1000 * 60 * 60);
    if (hoursSinceLastNudge < 20) {
      // Less than 20 hours = likely same day
      return { eligible: false, reason: "nudge_already_sent_today" };
    }
  }

  // 5. Consecutive ignore threshold reached
  if (engagement.consecutiveNudgeIgnores >= PROACTIVE_CONFIG.CONSECUTIVE_IGNORE_THRESHOLD) {
    // Check if cooldown period has passed
    if (engagement.lastProactiveNudgeAt) {
      const lastNudge = new Date(engagement.lastProactiveNudgeAt);
      const daysSince = (Date.now() - lastNudge.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < PROACTIVE_CONFIG.IGNORE_COOLDOWN_DAYS) {
        return { eligible: false, reason: "ignore_cooldown_active" };
      }
      // Cooldown expired — reset counter will happen on next nudge send
    }
  }

  // 6. Too new (signed up less than 2 days ago)
  if (engagement.signupDate) {
    const daysSinceSignup = (Date.now() - new Date(engagement.signupDate).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceSignup < PROACTIVE_CONFIG.MIN_DAYS_SINCE_SIGNUP) {
      return { eligible: false, reason: "too_new" };
    }
  }

  // 7. Adaptive skip based on consecutive ignores
  //    After 1 ignore → skip 1 day, After 2 → skip 2 days
  const ignores = engagement.consecutiveNudgeIgnores || 0;
  if (ignores > 0 && ignores < PROACTIVE_CONFIG.CONSECUTIVE_IGNORE_THRESHOLD) {
    if (engagement.lastProactiveNudgeAt) {
      const daysSinceLastNudge = (Date.now() - new Date(engagement.lastProactiveNudgeAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceLastNudge < ignores) {
        return { eligible: false, reason: `adaptive_skip_${ignores}_days` };
      }
    }
  }

  // 8. Check gap between any SERE reminder and this nudge
  if (engagement.lastReminderAt) {
    const hoursSinceReminder = (Date.now() - new Date(engagement.lastReminderAt).getTime()) / (1000 * 60 * 60);
    if (hoursSinceReminder < PROACTIVE_CONFIG.MIN_GAP_BETWEEN_ANY_REMINDER_HOURS) {
      return { eligible: false, reason: "too_close_to_other_reminder" };
    }
  }

  return { eligible: true, reason: "eligible" };
}

/**
 * Check if a pending/generated nudge already exists for this user today.
 * Prevents duplicate creation.
 *
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
async function hasPendingNudge(userId) {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const existing = await ProactiveMessage.findOne({
    userId,
    messageType: "memory_nudge",
    createdAt: { $gte: todayStart },
    status: { $in: ["pending", "generated", "dispatched"] },
  });

  return !!existing;
}

module.exports = {
  checkEligibility,
  hasPendingNudge,
  PROACTIVE_CONFIG,
};
