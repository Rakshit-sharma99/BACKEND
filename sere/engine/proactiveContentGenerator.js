/**
 * Proactive Content Generator — Template-based message generation
 * for Starman-initiated conversations.
 *
 * Designed as a template bank maintained by the creative team.
 * No LLM calls — all messages are pre-written with variable interpolation.
 *
 * Anti-repetition: tracks recently used templates per user in Redis
 * and avoids re-sending the same message within a 7-day window.
 */

const { getRedis } = require("../config/redis");

const RECENT_TEMPLATES_PREFIX = "sere:recent_nudge_templates:";
const RECENT_TEMPLATES_TTL = 7 * 24 * 60 * 60; // 7 days

// ══════════════════════════════════════════════════
// ── Template Bank ──
// ══════════════════════════════════════════════════

const PROACTIVE_TEMPLATES = {
  memory_nudge: {
    // ── Streak-aware templates ──
    streak_active: {
      witty: [
        "{{streakDays}} days of memories and counting 🔥 Don't break the chain — what happened today?",
        "Day {{streakDays}}. You're on a roll. Today's chapter is still unwritten ✍️",
        "{{streakDays}}-day streak! At this rate, you'll have a whole book by semester end 📖",
        "Streak check: {{streakDays}} days strong 💪 Shall we make it {{nextDay}}?",
      ],
      chill: [
        "You've been at it for {{streakDays}} days — that's impressive! Got anything from today?",
        "Day {{streakDays}} of your memory streak. No pressure, but... 😏",
      ],
      reflective: [
        "{{streakDays}} consecutive days of capturing moments. Today's story is waiting to be told.",
        "You've built something beautiful over {{streakDays}} days. Want to add today?",
      ],
    },

    // ── No streak (streakDays = 0) ──
    no_streak: {
      witty: [
        "Today had a story. Want to leave a trace of it?",
        "Before this day disappears into the stars, should we save a memory from it? ✨",
        "The best memories are the ones you almost forgot to capture 📸",
        "Plot twist: today actually happened. Wanna prove it? 🎬",
        "Your future self will thank you for saving this one. Just saying 🫡",
        "If you don't save it, did it even happen? Philosophy AND photography in one tap 📷",
      ],
      chill: [
        "Hey! How was today? Worth a memory? 🌅",
        "Anything today that made you smile? Even the little things count ✨",
        "Just checking in — any moments worth saving from today?",
        "Today's almost over. Any highlights? 🌙",
      ],
      reflective: [
        "Some days aren't about big moments — they're about small ones. Notice any today?",
        "What if the ordinary things today were actually the extraordinary ones? 🤔",
        "Every day has at least one moment worth remembering. What was yours?",
        "Before today becomes yesterday, is there something you'd want to remember?",
      ],
      curious: [
        "I'm curious — what was the most unexpected thing about today?",
        "If today were a movie scene, what would it be? 🎬",
        "One word to describe today? And more importantly — want to save the memory behind it?",
        "What made today different from yesterday? 🤔",
      ],
    },

    // ── Day-of-week specific ──
    monday: {
      witty: [
        "Monday survived ✅ That alone deserves a memory 😤",
        "You made it through Monday. That's worth documenting 🏆",
      ],
      chill: [
        "Mondays can surprise you sometimes. Anything worth remembering?",
      ],
    },

    friday: {
      witty: [
        "Friday vibes deserve to be immortalized. What made today worth it? 🌅",
        "TGIF! The week had a whole story. Want to capture the ending? 📖",
      ],
      chill: [
        "Happy Friday! Any memories from today before the weekend takes over?",
      ],
    },

    weekend: {
      witty: [
        "Weekend mode unlocked 🎮 Anything worth remembering so far?",
        "Weekends were made for creating memories. What's the vibe today? ✨",
      ],
      chill: [
        "Lazy day or adventure day? Either way — any memories to save? 🌤️",
      ],
    },

    // ── After broken streak ──
    streak_broken: {
      witty: [
        "Hey, streaks can restart 🔄 Want to begin a new one today?",
        "The best time to start a new streak was yesterday. The second best time is now 🚀",
      ],
      chill: [
        "No worries about the streak — today's a fresh start. Got a memory for it?",
      ],
      reflective: [
        "Every new chapter starts somewhere. Want to make today the first page?",
      ],
    },

    // ── Milestone celebrations (built into nudge when applicable) ──
    streak_milestone: {
      witty: [
        "🎉 {{streakDays}} DAYS! You're officially a memory machine! Keep it going?",
        "{{streakDays}}-day streak! That's not a streak, that's a lifestyle 🔥",
      ],
      chill: [
        "Wow, {{streakDays}} days of memories! That's really something. Today's next? 🌟",
      ],
    },
  },
};

// ── Title templates (for push notifications) ──
const PROACTIVE_TITLES = {
  memory_nudge: "✨ Starman",
  reflection: "💭 Starman",
  check_in: "👋 Starman",
  streak_milestone: "🔥 Starman",
};

// ══════════════════════════════════════════════════
// ── Template Selection Logic ──
// ══════════════════════════════════════════════════

/**
 * Pick the right template category based on user context.
 */
function selectTemplateCategory(context) {
  const { memoryStreak, dayOfWeek, previousStreakBroken } = context;

  // Milestone check (every 7, 30, 100 days)
  if (memoryStreak > 0 && (memoryStreak % 7 === 0 || memoryStreak === 30 || memoryStreak === 100)) {
    return "streak_milestone";
  }

  // Streak just broken
  if (previousStreakBroken) {
    return "streak_broken";
  }

  // Active streak
  if (memoryStreak > 0) {
    return "streak_active";
  }

  // Day-of-week specific
  const day = (dayOfWeek || "").toLowerCase();
  if (day === "monday" && PROACTIVE_TEMPLATES.memory_nudge.monday) {
    // 40% chance to use day-specific template
    if (Math.random() < 0.4) return "monday";
  }
  if (day === "friday" && PROACTIVE_TEMPLATES.memory_nudge.friday) {
    if (Math.random() < 0.4) return "friday";
  }
  if ((day === "saturday" || day === "sunday") && PROACTIVE_TEMPLATES.memory_nudge.weekend) {
    if (Math.random() < 0.4) return "weekend";
  }

  // Default: no streak
  return "no_streak";
}

/**
 * Resolve the best tone for the user.
 */
function resolveTone(preferredTone, templates) {
  if (templates[preferredTone]) return preferredTone;

  // Fallback chain
  const fallbacks = ["witty", "chill", "reflective", "curious", "informative"];
  for (const t of fallbacks) {
    if (templates[t]) return t;
  }
  return Object.keys(templates)[0];
}

/**
 * Interpolate variables into a template string.
 */
function interpolate(template, vars) {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const parts = key.split(".");
    let val = vars;
    for (const p of parts) {
      val = val?.[p];
      if (val === undefined) return match;
    }
    return String(val);
  });
}

/**
 * Pick a random item from an array, excluding recently used ones.
 */
function pickRandom(arr, recentlyUsed = []) {
  const available = arr.filter((t) => !recentlyUsed.includes(t));
  const pool = available.length > 0 ? available : arr; // fallback to all if all used
  return pool[Math.floor(Math.random() * pool.length)];
}

// ══════════════════════════════════════════════════
// ── Public API ──
// ══════════════════════════════════════════════════

/**
 * Generate a proactive nudge message for a user.
 *
 * @param {string} messageType - e.g. "memory_nudge"
 * @param {object} context - { memoryStreak, dayOfWeek, recentMemoryThemes, name, ... }
 * @param {object} engagement - UserEngagement profile
 * @returns {Promise<{ messageText: string, tone: string, title: string, templateKey: string }>}
 */
async function generateProactiveContent(messageType, context = {}, engagement = {}) {
  const typeTemplates = PROACTIVE_TEMPLATES[messageType];
  if (!typeTemplates) {
    return {
      messageText: "Today had a story. Want to leave a trace of it? ✨",
      tone: "chill",
      title: PROACTIVE_TITLES[messageType] || "✨ Starman",
      templateKey: "fallback",
    };
  }

  // 1. Select template category
  const category = selectTemplateCategory(context);
  const categoryTemplates = typeTemplates[category] || typeTemplates.no_streak;

  // 2. Resolve tone
  const preferredTone = engagement.preferredTone || "witty";
  const tone = resolveTone(preferredTone, categoryTemplates);
  const toneTemplates = categoryTemplates[tone];

  if (!toneTemplates || toneTemplates.length === 0) {
    return {
      messageText: "Today had a story. Want to leave a trace of it? ✨",
      tone: "chill",
      title: PROACTIVE_TITLES[messageType] || "✨ Starman",
      templateKey: "fallback",
    };
  }

  // 3. Get recently used templates for anti-repetition
  let recentlyUsed = [];
  try {
    const redis = getRedis();
    const userId = engagement.userId?.toString() || "unknown";
    const key = `${RECENT_TEMPLATES_PREFIX}${userId}`;
    const members = await redis.smembers(key);
    recentlyUsed = members || [];
  } catch (err) {
    // Redis failure shouldn't block message generation
    console.error("[ProactiveContentGen] Redis read failed:", err.message);
  }

  // 4. Pick template and interpolate
  const template = pickRandom(toneTemplates, recentlyUsed);
  const vars = {
    ...context,
    name: engagement.universeMetaData?.name || "Astronaut",
    nextDay: (context.memoryStreak || 0) + 1,
  };
  const messageText = interpolate(template, vars);

  // 5. Record this template as recently used
  try {
    const redis = getRedis();
    const userId = engagement.userId?.toString() || "unknown";
    const key = `${RECENT_TEMPLATES_PREFIX}${userId}`;
    await redis.sadd(key, template);
    await redis.expire(key, RECENT_TEMPLATES_TTL);
  } catch (err) {
    console.error("[ProactiveContentGen] Redis write failed:", err.message);
  }

  const templateKey = `${messageType}.${category}.${tone}`;

  return {
    messageText,
    tone,
    title: PROACTIVE_TITLES[messageType] || "✨ Starman",
    templateKey,
  };
}

module.exports = {
  generateProactiveContent,
  PROACTIVE_TEMPLATES,
  PROACTIVE_TITLES,
};
