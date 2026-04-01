/**
 * Content Generator — Starman's witty voice for reminders.
 *
 * Selects a template based on reminder type + tone, then interpolates
 * variables like {{user.name}}, {{streakDays}}, {{query}}, etc.
 */

// ── Template Bank ──
const TEMPLATES = {
  onboarding_club: {
    witty: [
      "You just landed on Macbease 🌍… but you're still standing at the airport. Wanna join your first club?",
      "Your profile looks lonely 😢 Give it some friends — join a club!",
      "Plot twist: the real Macbease experience starts when you join a club 🎬",
      "Other astronauts are vibing in clubs right now. You? You're still reading the safety manual 📖",
    ],
    chill: [
      "Hey! There are some cool clubs here that match your vibe. Wanna check 'em out? 👀",
      "No pressure, but clubs are where the magic happens ✨",
    ],
    dramatic: [
      "⚠️ ALERT: Unjoined clubs detected in your vicinity. Your social life is at risk.",
    ],
    informative: [
      "Joining a club helps you connect with people who share your interests. Explore clubs now!",
    ],
  },

  onboarding_event: {
    witty: [
      "Events are happening and you're still chilling on the couch 🛋️ Get in there!",
      "Everyone's at the party. You weren't invited? Oh wait, you were — you just forgot to look 🎉",
    ],
    chill: [
      "Some cool events coming up. Might be your thing! 🎫",
    ],
    dramatic: [
      "🚨 EVENT ALERT 🚨 Your classmates are going. Are you?",
    ],
    informative: [
      "Check out upcoming events on Macbease — there might be something perfect for you!",
    ],
  },

  onboarding_memory: {
    witty: [
      "Upload a memory before your brain deletes it 🧠📸",
      "Memories fade. Macbease doesn't. Upload your first one!",
    ],
    chill: [
      "Got any photos worth sharing? Your Macbease memory wall is waiting! 📷",
    ],
    informative: [
      "Capture and share your best moments. Upload your first memory on Macbease!",
    ],
  },

  onboarding_assets: {
    witty: [
      "Your territory is emptier than space itself 🌑 Add some assets!",
      "Even astronauts decorate their space stations. How about your territory?",
    ],
    chill: [
      "Personalize your territory! Add some assets to make it yours 🏗️",
    ],
    informative: [
      "Add assets to your territory to showcase your interests and personality!",
    ],
  },

  onboarding_post: {
    witty: [
      "You've been lurking long enough 👀 Time for your first post!",
      "Your keyboard misses you. Type something. Anything. Post it.",
    ],
    chill: [
      "Feel like sharing something? Your first community post is just a few taps away ✍️",
    ],
    informative: [
      "Engage with your communities by making your first post!",
    ],
  },

  streak_warning: {
    witty: [
      "Your streak is hanging by a thread 🧵 One post and you're a legend again.",
      "{{streakDays}} days strong 💪 Don't let it die. One post. That's all.",
      "Your streak called. It said 'please don't abandon me' 😭",
    ],
    dramatic: [
      "⚠️ STREAK EMERGENCY ⚠️ You have {{hoursLeft}}h to save your {{streakDays}}-day streak!",
      "🔥 {{streakDays}}-DAY STREAK IN DANGER 🔥 Post now or lose it forever!",
    ],
    chill: [
      "Hey, your streak is about to reset. A quick post keeps it alive 🔄",
    ],
    informative: [
      "Your {{streakDays}}-day streak will reset soon. Post in your community to maintain it.",
    ],
  },

  deferred_answer: {
    witty: [
      "Remember when you asked '{{query}}'? I went detective mode 🕵️ — got something for you.",
      "So about that question you asked… '{{query}}' — turns out I found an answer 🧠",
    ],
    chill: [
      "Hey! I found an answer to your earlier question: '{{query}}'",
    ],
    informative: [
      "An answer has been found for your question: '{{query}}'. Check it out!",
    ],
  },

  re_engagement: {
    witty: [
      "It's been {{daysSince}} days… did you ghost us? 👻 There's cool stuff happening.",
      "The pigeons at Macbease miss you 🐦 Come back, we have events!",
      "We noticed you left. The WiFi's still free and the vibes are immaculate. Come back 🫠",
      "{{daysSince}} days without you felt like {{daysSince}} years 😢 Let's fix that.",
    ],
    dramatic: [
      "📡 LOST SIGNAL DETECTED 📡 Astronaut {{name}}, do you copy? Return to base!",
    ],
    chill: [
      "Hey {{name}}, been a while! Things are popping on Macbease. Check it out when you can 🙌",
    ],
    informative: [
      "You've been away for {{daysSince}} days. Here's what's been happening on Macbease.",
    ],
  },

  trending: {
    witty: [
      "🔥 Hot event alert: '{{eventName}}' — everyone's talking about it. You in?",
      "Something big is happening: '{{eventName}}'. Don't be the last to know 👀",
    ],
    chill: [
      "There's a trending event you might like: '{{eventName}}' 🎯",
    ],
    informative: [
      "Trending event: '{{eventName}}'. Check out the details and get your ticket!",
    ],
  },

  campaign: {
    // Campaign content uses custom templates from the Campaign model,
    // but these serve as fallbacks
    witty: [
      "Starman has a special message for you today 🚀",
    ],
    chill: [
      "Here's something cool we wanted to share with you 🎁",
    ],
    informative: [
      "Important update from Macbease 📢",
    ],
  },

  watchlist_match: {
    witty: [
      "🚨 Your radar picked something up! '{{query}}' — it's happening!",
      "Remember when you said 'tell me when {{query}}'? Well... NOW 🎯",
    ],
    chill: [
      "Heads up! Something matching '{{query}}' just dropped.",
    ],
    informative: [
      "A match was found for your watchlist item: '{{query}}'",
    ],
  },
};

// ── Title Templates ──
const TITLES = {
  onboarding_club: "Join your first club! 🏠",
  onboarding_event: "Events are calling! 🎫",
  onboarding_memory: "Capture a memory! 📸",
  onboarding_assets: "Decorate your territory! 🏗️",
  onboarding_post: "Make your first post! ✍️",
  streak_warning: "Streak alert! 🔥",
  deferred_answer: "Answer found! 🕵️",
  re_engagement: "We miss you! 👋",
  trending: "Trending now! 🔥",
  campaign: "From Starman 🚀",
  watchlist_match: "Watchlist alert! 🎯",
};

/**
 * Interpolate variables into a template string.
 * Variables look like {{key}} or {{nested.key}}.
 */
function interpolate(template, vars) {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (match, key) => {
    const parts = key.split(".");
    let val = vars;
    for (const p of parts) {
      val = val?.[p];
      if (val === undefined) return match; // keep original if not found
    }
    return String(val);
  });
}

/**
 * Pick a random item from an array.
 */
function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Resolve the best tone for a user based on their engagement profile.
 * Falls back through tone preferences if templates not available.
 */
function resolveTone(preferredTone, humorTolerance, templateKey) {
  const templates = TEMPLATES[templateKey];
  if (!templates) return "informative";

  // If humor tolerance is low, shift away from witty/dramatic
  if (humorTolerance < 0.3) {
    if (templates.informative) return "informative";
    if (templates.chill) return "chill";
  }

  // Try preferred tone first
  if (templates[preferredTone]) return preferredTone;

  // Fallback chain
  const fallbacks = ["witty", "chill", "informative", "dramatic"];
  for (const t of fallbacks) {
    if (templates[t]) return t;
  }

  return "witty";
}

/**
 * Generate reminder content (title + body) for a given type.
 *
 * @param {string} templateKey - e.g. "streak_warning", "onboarding_club"
 * @param {object} vars - interpolation variables
 * @param {object} engagement - the user's UserEngagement profile
 * @returns {{ title: string, body: string, tone: string }}
 */
function generateContent(templateKey, vars = {}, engagement = {}) {
  const {
    preferredTone = "witty",
    humorTolerance = 0.7,
  } = engagement;

  const tone = resolveTone(preferredTone, humorTolerance, templateKey);

  const templates = TEMPLATES[templateKey];
  if (!templates || !templates[tone]) {
    return {
      title: TITLES[templateKey] || "Hey from Starman! 🚀",
      body: "Something cool is waiting for you on Macbease ✨",
      tone: "informative",
    };
  }

  const body = interpolate(pickRandom(templates[tone]), vars);
  const title = TITLES[templateKey] || "Hey from Starman! 🚀";

  return { title, body, tone };
}

/**
 * Generate content from a Campaign's custom templates.
 */
function generateCampaignContent(campaign, vars = {}) {
  const title = interpolate(campaign.titleTemplate, vars);
  const body = interpolate(campaign.bodyTemplate, vars);
  return { title, body, tone: campaign.tone || "witty" };
}

module.exports = {
  generateContent,
  generateCampaignContent,
  TEMPLATES,
  TITLES,
};
