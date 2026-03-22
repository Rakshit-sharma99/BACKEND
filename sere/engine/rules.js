/**
 * Rule Engine — evaluates events and user state to decide when
 * to create reminders.
 *
 * Each rule is a pure function:
 *   (eventData, userEngagement) => Reminder spec | null
 *
 * Rules are triggered by:
 *   - Kafka events (user.signup, streak.update, query.deferred, etc.)
 *   - Scheduled cron checks (re-engagement, campaign delivery)
 */

const Reminder = require("../models/reminder");
const UserEngagement = require("../models/userEngagement");
const { generateContent } = require("./contentGenerator");

// ── Constants ──
const ONBOARDING_CLUB_DELAY_MS = 24 * 60 * 60 * 1000;  // 24 hours
const ONBOARDING_EVENT_DELAY_MS = 48 * 60 * 60 * 1000;  // 48 hours
const ONBOARDING_GENERAL_DELAY_MS = 72 * 60 * 60 * 1000; // 72 hours
const RE_ENGAGEMENT_THRESHOLD_DAYS = 3;
const DORMANT_THRESHOLD_DAYS = 7;
const CHURNED_THRESHOLD_DAYS = 30;
const MAX_REMINDERS_PER_DAY = 5;
const MIN_REMINDER_GAP_MS = 2 * 60 * 60 * 1000; // 2 hours between reminders

/**
 * Check if we can send a reminder to this user (throttling).
 */
function canSendReminder(engagement) {
  if (engagement.optedOut) return false;
  if (engagement.remindersSentToday >= MAX_REMINDERS_PER_DAY) return false;

  // Adaptive throttling: reduce frequency after consecutive ignores
  const ignores = engagement.consecutiveIgnores || 0;
  const effectiveMax = Math.max(1, MAX_REMINDERS_PER_DAY - Math.floor(ignores / 2));
  if (engagement.remindersSentToday >= effectiveMax) return false;

  // Min gap between reminders
  if (engagement.lastReminderAt) {
    const gap = Date.now() - new Date(engagement.lastReminderAt).getTime();
    // Increase gap for users who ignore reminders
    const adjustedGap = MIN_REMINDER_GAP_MS * (1 + ignores * 0.5);
    if (gap < adjustedGap) return false;
  }

  return true;
}

/**
 * Check if current time is within user's quiet hours.
 */
function isQuietHours(engagement) {
  const now = new Date();
  const hour = now.getHours();
  const start = engagement.quietHoursStart ?? 23;
  const end = engagement.quietHoursEnd ?? 7;

  if (start > end) {
    // Wraps midnight, e.g. 23:00 - 07:00
    return hour >= start || hour < end;
  }
  return hour >= start && hour < end;
}

/**
 * Check if a similar reminder already exists (dedup).
 */
async function hasDuplicate(userId, type, triggerRef, hoursWindow = 24) {
  const since = new Date(Date.now() - hoursWindow * 60 * 60 * 1000);
  const existing = await Reminder.findOne({
    userId,
    type,
    "trigger.ref": triggerRef,
    createdAt: { $gte: since },
    status: { $in: ["pending", "scheduled", "delivered"] },
  });
  return !!existing;
}

/**
 * Create a reminder and update engagement stats.
 */
async function createReminder(spec) {
  const reminder = await Reminder.create(spec);

  // Update engagement
  await UserEngagement.findOneAndUpdate(
    { userId: spec.userId },
    {
      $inc: { remindersSentToday: 1, totalRemindersReceived: 1 },
      $set: { lastReminderAt: new Date() },
    },
  );

  console.log(`📩 Created ${spec.type} reminder for user ${spec.userId}`);
  return reminder;
}

// ══════════════════════════════════════════════════
// ── Individual Rules ──
// ══════════════════════════════════════════════════

/**
 * Rule: onboarding_club
 * Trigger: user.signup event — fires 24h after signup if user hasn't joined a club.
 */
async function onboardingClubRule(engagement) {
  if (engagement.onboarding?.joinedClub) return null;
  if (engagement.lifecycleStage !== "new") return null;

  const timeSinceSignup = Date.now() - new Date(engagement.signupDate).getTime();
  if (timeSinceSignup < ONBOARDING_CLUB_DELAY_MS) return null;

  if (await hasDuplicate(engagement.userId, "onboarding", "onboarding_club")) return null;

  const content = generateContent("onboarding_club", {}, engagement);

  return {
    userId: engagement.userId,
    uid: engagement.uid,
    type: "onboarding",
    ...content,
    channel: "push",
    scheduledFor: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    trigger: { source: "system", ref: "onboarding_club", rule: "onboarding_club" },
    action: { navigateTo: "clubSearch", params: {} },
    universeMetaData: engagement.universeMetaData,
  };
}

/**
 * Rule: onboarding_event
 * Fires 48h after signup if user hasn't attended/bought ticket for an event.
 */
async function onboardingEventRule(engagement) {
  if (engagement.onboarding?.attendedEvent) return null;
  if (engagement.lifecycleStage !== "new") return null;

  const timeSinceSignup = Date.now() - new Date(engagement.signupDate).getTime();
  if (timeSinceSignup < ONBOARDING_EVENT_DELAY_MS) return null;

  if (await hasDuplicate(engagement.userId, "onboarding", "onboarding_event")) return null;

  const content = generateContent("onboarding_event", {}, engagement);

  return {
    userId: engagement.userId,
    uid: engagement.uid,
    type: "onboarding",
    ...content,
    channel: "push",
    scheduledFor: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    trigger: { source: "system", ref: "onboarding_event", rule: "onboarding_event" },
    action: { navigateTo: "events", params: {} },
    universeMetaData: engagement.universeMetaData,
  };
}

/**
 * Rule: onboarding_memory
 * Fires 72h after signup if user hasn't uploaded a memory.
 */
async function onboardingMemoryRule(engagement) {
  if (engagement.onboarding?.uploadedMemory) return null;
  if (engagement.lifecycleStage !== "new") return null;

  const timeSinceSignup = Date.now() - new Date(engagement.signupDate).getTime();
  if (timeSinceSignup < ONBOARDING_GENERAL_DELAY_MS) return null;

  if (await hasDuplicate(engagement.userId, "onboarding", "onboarding_memory")) return null;

  const content = generateContent("onboarding_memory", {}, engagement);

  return {
    userId: engagement.userId,
    uid: engagement.uid,
    type: "onboarding",
    ...content,
    channel: "push",
    scheduledFor: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    trigger: { source: "system", ref: "onboarding_memory", rule: "onboarding_memory" },
    action: { navigateTo: "memories", params: {} },
    universeMetaData: engagement.universeMetaData,
  };
}

/**
 * Rule: streak_warning
 * Trigger: streak.update event or daily cron check.
 * Fires when a user's community streak is about to break.
 */
async function streakWarningRule(engagement, eventData = {}) {
  const { streakDays, hoursLeft, communityId, communityName } = eventData;
  if (!streakDays || streakDays < 2) return null; // don't warn for day-1

  const ref = `streak_${communityId || "general"}_${engagement.userId}`;
  if (await hasDuplicate(engagement.userId, "streak", ref, 12)) return null;

  const content = generateContent("streak_warning", {
    streakDays,
    hoursLeft: hoursLeft || 12,
    communityName: communityName || "your community",
  }, engagement);

  return {
    userId: engagement.userId,
    uid: engagement.uid,
    type: "streak",
    ...content,
    channel: "push",
    scheduledFor: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
    trigger: { source: "system", ref, rule: "streak_warning" },
    action: {
      navigateTo: "community",
      params: { id: communityId },
    },
    universeMetaData: engagement.universeMetaData,
  };
}

/**
 * Rule: re_engagement
 * Trigger: daily cron — fires when user hasn't been active for N days.
 */
async function reEngagementRule(engagement) {
  if (!engagement.lastActiveAt) return null;

  const daysSince = Math.floor(
    (Date.now() - new Date(engagement.lastActiveAt).getTime()) / (24 * 60 * 60 * 1000)
  );

  if (daysSince < RE_ENGAGEMENT_THRESHOLD_DAYS) return null;

  // Update lifecycle stage
  let newStage = engagement.lifecycleStage;
  if (daysSince >= CHURNED_THRESHOLD_DAYS) newStage = "churned";
  else if (daysSince >= DORMANT_THRESHOLD_DAYS) newStage = "dormant";

  if (newStage !== engagement.lifecycleStage) {
    await UserEngagement.findOneAndUpdate(
      { userId: engagement.userId },
      { $set: { lifecycleStage: newStage } },
    );
  }

  const ref = `re_engage_${engagement.userId}`;
  if (await hasDuplicate(engagement.userId, "re_engagement", ref, 72)) return null;

  const content = generateContent("re_engagement", {
    daysSince,
    name: engagement.universeMetaData?.name || "Astronaut",
  }, engagement);

  return {
    userId: engagement.userId,
    uid: engagement.uid,
    type: "re_engagement",
    ...content,
    channel: "push",
    scheduledFor: new Date(),
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days
    trigger: { source: "system", ref, rule: "re_engagement" },
    action: { navigateTo: "Home", params: {} },
    universeMetaData: engagement.universeMetaData,
  };
}

/**
 * Rule: deferred_answer
 * Trigger: answer.resolved Kafka event.
 */
async function deferredAnswerRule(engagement, eventData = {}) {
  const { query, answerId } = eventData;
  if (!query) return null;

  const ref = `deferred_${answerId || query}`;
  if (await hasDuplicate(engagement.userId, "deferred_answer", ref)) return null;

  const content = generateContent("deferred_answer", { query }, engagement);

  return {
    userId: engagement.userId,
    uid: engagement.uid,
    type: "deferred_answer",
    ...content,
    channel: "push",
    scheduledFor: new Date(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    trigger: { source: "deferred_query", ref, rule: "deferred_answer" },
    action: { navigateTo: "starmanChat", params: { query } },
    universeMetaData: engagement.universeMetaData,
  };
}

/**
 * Rule: watchlist_match
 * Trigger: checked periodically — matches events/clubs against user watchlist.
 */
async function watchlistMatchRule(engagement, matchData = {}) {
  const { query, matchType, matchId, matchName } = matchData;
  if (!query) return null;

  const ref = `watchlist_${matchId || query}`;
  if (await hasDuplicate(engagement.userId, "user_created", ref)) return null;

  const content = generateContent("watchlist_match", {
    query,
    matchName: matchName || query,
  }, engagement);

  return {
    userId: engagement.userId,
    uid: engagement.uid,
    type: "user_created",
    ...content,
    channel: "push",
    scheduledFor: new Date(),
    expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    trigger: { source: "user", ref, rule: "watchlist_match" },
    action: {
      navigateTo: matchType === "event" ? "eventExpand" : "Home",
      params: { id: matchId },
    },
    universeMetaData: engagement.universeMetaData,
  };
}

// ══════════════════════════════════════════════════
// ── Rule Runner ──
// ══════════════════════════════════════════════════

/**
 * Process a Kafka event through matching rules.
 *
 * @param {string} eventType - Kafka topic name
 * @param {object} eventData - event payload
 */
async function processEvent(eventType, eventData) {
  try {
    const { userId, uid } = eventData;
    if (!userId) {
      console.warn(`⚠️ SERE: event ${eventType} missing userId, skipping.`);
      return;
    }

    // Get or create engagement profile
    let engagement = await UserEngagement.findOne({ userId });
    if (!engagement) {
      engagement = await UserEngagement.create({
        userId,
        uid,
        signupDate: new Date(),
        universeMetaData: eventData.universeMetaData || {},
      });
    }

    // Throttle check
    if (!canSendReminder(engagement)) {
      console.log(`⏸️ SERE: throttled for user ${userId}`);
      return;
    }

    // Quiet hours check — schedule for later instead of skipping
    const quiet = isQuietHours(engagement);

    let spec = null;

    switch (eventType) {
      case "user.signup":
        // Don't fire immediately — onboarding rules have delay built in,
        // but mark the user as newly created
        await UserEngagement.findOneAndUpdate(
          { userId },
          { $set: { signupDate: new Date(), lifecycleStage: "new" } },
        );
        console.log(`👋 SERE: registered new user ${userId}`);
        return;

      case "streak.update":
        spec = await streakWarningRule(engagement, eventData);
        break;

      case "query.deferred":
        // Store the deferred query for later resolution
        await UserEngagement.findOneAndUpdate(
          { userId },
          {
            $push: {
              deferredQueries: {
                query: eventData.query,
                askedAt: new Date(),
              },
            },
          },
        );
        console.log(`📝 SERE: stored deferred query for user ${userId}`);
        return;

      case "answer.resolved":
        spec = await deferredAnswerRule(engagement, eventData);
        break;

      case "user.activity": {
        // Update last active timestamp and lifecycle
        const updateFields = {
          lastActiveAt: new Date(),
          lifecycleStage: "active",
        };

        // Map activityType to onboarding checklist flags
        const activityType = eventData.activityType;
        const onboardingMap = {
          club_join: "onboarding.joinedClub",
          event_attend: "onboarding.attendedEvent",
          memory_upload: "onboarding.uploadedMemory",
          assets_added: "onboarding.addedAssets",
          first_post: "onboarding.firstPost",
        };

        if (activityType && onboardingMap[activityType]) {
          updateFields[onboardingMap[activityType]] = true;
          console.log(`✅ SERE: marked ${activityType} for user ${userId}`);
        }

        await UserEngagement.findOneAndUpdate(
          { userId },
          { $set: updateFields },
        );
        return;
      }

      default:
        console.log(`ℹ️ SERE: unhandled event type: ${eventType}`);
        return;
    }

    if (spec) {
      // If quiet hours, schedule for after quiet hours end
      if (quiet) {
        const end = engagement.quietHoursEnd || 7;
        const scheduledFor = new Date();
        scheduledFor.setHours(end, 0, 0, 0);
        if (scheduledFor <= new Date()) {
          scheduledFor.setDate(scheduledFor.getDate() + 1);
        }
        spec.scheduledFor = scheduledFor;
        spec.status = "scheduled";
      } else {
        spec.status = "scheduled";
      }

      await createReminder(spec);
    }
  } catch (error) {
    console.error(`❌ SERE processEvent error (${eventType}):`, error);
  }
}

/**
 * Run all cron-based rules (called by scheduler).
 * Checks all users for re-engagement, onboarding nudges, etc.
 */
async function runCronRules() {
  console.log("⏰ SERE: running cron rules...");

  try {
    // Find users who may need nudges
    const engagements = await UserEngagement.find({
      optedOut: { $ne: true },
    }).limit(500); // Process in batches

    let created = 0;

    for (const engagement of engagements) {
      if (!canSendReminder(engagement)) continue;

      const rules = [
        onboardingClubRule,
        onboardingEventRule,
        onboardingMemoryRule,
        reEngagementRule,
      ];

      for (const rule of rules) {
        const spec = await rule(engagement);
        if (spec) {
          const quiet = isQuietHours(engagement);
          if (quiet) {
            const end = engagement.quietHoursEnd || 7;
            const scheduledFor = new Date();
            scheduledFor.setHours(end, 0, 0, 0);
            if (scheduledFor <= new Date()) {
              scheduledFor.setDate(scheduledFor.getDate() + 1);
            }
            spec.scheduledFor = scheduledFor;
          }
          spec.status = "scheduled";
          await createReminder(spec);
          created++;
          break; // Only one reminder per user per cron run
        }
      }
    }

    console.log(`⏰ SERE: cron rules created ${created} reminders`);
  } catch (error) {
    console.error("❌ SERE cron rules error:", error);
  }
}

module.exports = {
  processEvent,
  runCronRules,
  canSendReminder,
  isQuietHours,
  // Export individual rules for testing
  onboardingClubRule,
  onboardingEventRule,
  onboardingMemoryRule,
  streakWarningRule,
  reEngagementRule,
  deferredAnswerRule,
  watchlistMatchRule,
};
