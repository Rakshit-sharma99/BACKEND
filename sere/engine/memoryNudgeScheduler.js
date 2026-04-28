/**
 * Memory Nudge Scheduler — Hourly timezone-cohort processor.
 *
 * Runs every hour (via cron in scheduler.js).
 * For each run:
 *   1. Determines which timezone cohorts have their evening window NOW
 *   2. Queries UserEngagement for eligible users in those timezones
 *   3. For each eligible user: generates message, creates ProactiveMessage
 *   4. ProactiveMessages are picked up by the proactiveDispatcher on 5-min tick
 *
 * Why hourly + timezone cohorts?
 *   - Single cron job handles all timezones
 *   - Simpler ops than per-timezone cron configurations
 *   - Naturally scales as user base grows
 */

const UserEngagement = require("../models/userEngagement");
const ProactiveMessage = require("../models/proactiveMessage");
const { checkEligibility, hasPendingNudge, PROACTIVE_CONFIG } = require("./memoryNudgeRule");
const { generateProactiveContent } = require("./proactiveContentGenerator");

// ── Timezone → UTC offset mapping (common Indian/global timezones) ──
// We bucket users by their timezone string and check if evening window
// overlaps with the current UTC hour.

const DAYS_OF_WEEK = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/**
 * Get the current local hour for a given IANA timezone.
 *
 * @param {string} timezone - IANA timezone (e.g. "Asia/Kolkata")
 * @returns {number} - local hour (0-23)
 */
function getLocalHour(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    });
    return parseInt(formatter.format(now), 10);
  } catch (err) {
    // Invalid timezone — default to IST
    console.warn(`[MemoryNudgeScheduler] Invalid timezone: ${timezone}, defaulting to IST`);
    return new Date().getUTCHours() + 5; // rough IST approximation
  }
}

/**
 * Get the current local day of week for a timezone.
 */
function getLocalDayOfWeek(timezone) {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    });
    return formatter.format(now);
  } catch {
    return DAYS_OF_WEEK[new Date().getDay()];
  }
}

/**
 * Check if a timezone is currently in the evening window.
 *
 * @param {string} timezone
 * @returns {boolean}
 */
function isInEveningWindow(timezone) {
  const localHour = getLocalHour(timezone);
  return (
    localHour >= PROACTIVE_CONFIG.EVENING_WINDOW_START &&
    localHour < PROACTIVE_CONFIG.EVENING_WINDOW_END
  );
}

/**
 * Main scheduler function — called every hour by cron.
 *
 * Finds all unique timezones, checks which are in evening window,
 * then processes eligible users in those timezones.
 */
async function runMemoryNudgeCheck() {
  console.log("🌙 SERE: running memory nudge check...");

  try {
    // 1. Find all distinct timezones with active users
    const timezones = await UserEngagement.distinct("timezone", {
      optedOut: { $ne: true },
      proactiveOptOut: { $ne: true },
    });

    // 2. Filter to timezones currently in evening window
    const activeTimezones = timezones.filter((tz) => isInEveningWindow(tz));

    if (activeTimezones.length === 0) {
      console.log("🌙 SERE: no timezones in evening window right now");
      return { processed: 0, created: 0 };
    }

    console.log(`🌙 SERE: evening window active for: ${activeTimezones.join(", ")}`);

    let totalProcessed = 0;
    let totalCreated = 0;

    // 3. Process each timezone cohort
    for (const timezone of activeTimezones) {
      const { processed, created } = await processTimezoneCohort(timezone);
      totalProcessed += processed;
      totalCreated += created;
    }

    console.log(`🌙 SERE: memory nudge check complete — ${totalCreated}/${totalProcessed} nudges created`);
    return { processed: totalProcessed, created: totalCreated };
  } catch (error) {
    console.error("❌ SERE: memory nudge scheduler error:", error);
    return { processed: 0, created: 0, error: error.message };
  }
}

/**
 * Process all eligible users in a single timezone cohort.
 *
 * @param {string} timezone
 */
async function processTimezoneCohort(timezone) {
  // Find users in this timezone who haven't created a memory today
  const engagements = await UserEngagement.find({
    timezone,
    optedOut: { $ne: true },
    proactiveOptOut: { $ne: true },
    memoryCreatedToday: { $ne: true },
  }).limit(500);

  let processed = 0;
  let created = 0;

  const dayOfWeek = getLocalDayOfWeek(timezone);

  // Process with concurrency limit
  const BATCH_SIZE = 10;
  for (let i = 0; i < engagements.length; i += BATCH_SIZE) {
    const batch = engagements.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (engagement) => {
        processed++;

        try {
          // Check eligibility
          const { eligible, reason } = checkEligibility(engagement);
          if (!eligible) {
            return;
          }

          // Check for duplicate pending nudge
          if (await hasPendingNudge(engagement.userId)) {
            return;
          }

          // Generate message content
          const context = {
            memoryStreak: engagement.memoryStreak || 0,
            dayOfWeek,
            lastMemoryDate: engagement.lastMemoryDate,
            recentMemoryThemes: [], // TODO: fetch from recent memories if needed
            previousStreakBroken: engagement.memoryStreak === 0 && !!engagement.lastMemoryDate,
          };

          const { messageText, tone, title, templateKey } =
            await generateProactiveContent("memory_nudge", context, engagement);

          // Calculate expiry — next morning (7 AM local)
          const now = new Date();
          const expiresAt = new Date(now);
          expiresAt.setHours(expiresAt.getHours() + PROACTIVE_CONFIG.MESSAGE_EXPIRY_HOURS);

          // Create ProactiveMessage
          await ProactiveMessage.create({
            userId: engagement.userId,
            uid: engagement.uid,
            messageText,
            messageType: "memory_nudge",
            tone,
            status: "generated",
            scheduledFor: now, // ready for immediate dispatch
            expiresAt,
            generationContext: {
              memoryStreak: context.memoryStreak,
              lastMemoryDate: context.lastMemoryDate,
              recentMemoryThemes: context.recentMemoryThemes,
              dayOfWeek,
              templateKey,
            },
            trigger: {
              source: "sere_scheduler",
              rule: "daily_memory_nudge",
            },
            action: {
              navigateTo: "starmanChat",
              params: {},
            },
            universeMetaData: engagement.universeMetaData,
          });

          created++;
        } catch (err) {
          console.error(
            `❌ SERE: nudge generation failed for user ${engagement.userId}:`,
            err.message,
          );
        }
      }),
    );
  }

  if (created > 0) {
    console.log(`🌙 SERE: [${timezone}] created ${created} nudges (${processed} checked)`);
  }

  return { processed, created };
}

module.exports = {
  runMemoryNudgeCheck,
  processTimezoneCohort,
  isInEveningWindow,
  getLocalHour,
};
