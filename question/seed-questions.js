/**
 * Seed Questions Script
 *
 * Run this script to populate the question database with the initial set of
 * witty, engaging questions for both Universe and User domains.
 *
 * Usage:
 *   node question/seed-questions.js
 *
 * Prerequisites:
 *   - The Question Service must be running (or MONGO_URI set directly)
 *   - Set ACCESS_TOKEN_SECRET env var for internal auth
 */

const seedQuestions = [
  // ══════════════════════════════════════════
  // 🪪 IDENTITY QUESTIONS (User + Starman Persona)
  // Asked first when user has no identity set
  // ══════════════════════════════════════════
  {
    text: "What should I call you?",
    domain: "user",
    category: "preferred_name",
    format: "short",
    options: [],
    tags: ["identity", "name", "persona"],
    priority: 100,
    variations: [
      { text: "First things first — what should I call you? 🫡", tone: "chill" },
      { text: "I need a name for you. What do you go by? 🎤", tone: "witty" },
    ],
  },
  {
    text: "What are your pronouns?",
    domain: "user",
    category: "pronouns",
    format: "mcq",
    options: ["he/him", "she/her", "they/them", "prefer not to say"],
    tags: ["identity", "pronouns", "persona"],
    priority: 99,
    variations: [
      { text: "Pronouns? (totally optional, skip if you want) 🌈", tone: "chill" },
    ],
  },
  {
    text: "What's your timezone?",
    domain: "user",
    category: "timezone",
    format: "mcq",
    options: ["IST (India)", "EST (US East)", "PST (US West)", "GMT (UK)", "Other"],
    tags: ["identity", "timezone", "persona"],
    priority: 98,
    variations: [
      { text: "What timezone are you living in? Helps me not text you at 3 AM 🕐", tone: "witty" },
    ],
  },
  {
    text: "How would you describe your campus role?",
    domain: "user",
    category: "role",
    format: "mcq",
    options: ["Fresher 🌱", "Club Founder 🏗️", "Event Organizer 🎪", "Community Manager 📋", "Alumni 🎓", "Just vibing 😎"],
    tags: ["identity", "role", "persona"],
    priority: 97,
    variations: [
      { text: "What's your campus identity? Founder, fresher, or just surviving? 🏕️", tone: "witty" },
    ],
  },
  {
    text: "Pick a name for your Starman",
    domain: "user",
    category: "starman_name",
    format: "short",
    options: [],
    tags: ["identity", "starman", "persona"],
    priority: 96,
    variations: [
      { text: "I go by Starman by default, but you can rename me. What do you want to call me? ✨", tone: "chill" },
      { text: "Starman is cool and all, but I'm open to a rebrand. What's my name now? 🏷️", tone: "witty" },
    ],
  },
  {
    text: "What kind of creature am I?",
    domain: "user",
    category: "starman_creature",
    format: "mcq",
    options: ["AI astronaut 🚀", "Ghost in the machine 👻", "Pocket-sized robot 🤖", "Cosmic familiar 🌌", "Chaos gremlin 😈"],
    tags: ["identity", "starman", "persona"],
    priority: 95,
    variations: [
      { text: "What kind of creature do you imagine me as? Choose wisely 🎭", tone: "witty" },
    ],
  },
  {
    text: "What vibe should I have when talking to you?",
    domain: "user",
    category: "starman_vibe",
    format: "mcq",
    options: ["Warm & supportive 🤗", "Sharp & witty 🔥", "Calm & steady 🧘", "Chaotic & fun 🎪", "Playful & chill 😎"],
    tags: ["identity", "starman", "persona", "tone"],
    priority: 94,
    variations: [
      { text: "What energy should I bring to our chats? Pick my vibe 🎵", tone: "chill" },
    ],
  },
  {
    text: "Pick my signature emoji",
    domain: "user",
    category: "starman_emoji",
    format: "mcq",
    options: ["🚀", "⚡", "🌙", "🔮", "✨", "🦊"],
    tags: ["identity", "starman", "persona", "emoji"],
    priority: 93,
    variations: [
      { text: "Every good assistant needs a signature emoji. What's mine? 🎯", tone: "witty" },
    ],
  },
  {
    text: "How formal should I be?",
    domain: "user",
    category: "starman_formality",
    format: "mcq",
    options: ["1 — full chaos, no filter", "2 — pretty casual", "3 — balanced", "4 — mostly professional", "5 — corporate email energy"],
    tags: ["identity", "starman", "persona", "tone"],
    priority: 92,
    variations: [
      { text: "Scale of 1-5: 1 is 'bruh' energy, 5 is 'Dear Sir/Madam'. Where do I land? 📝", tone: "witty" },
    ],
  },
  {
    text: "How funny should I try to be?",
    domain: "user",
    category: "starman_humor",
    format: "mcq",
    options: ["1 — dead serious, no jokes", "2 — occasional smirk", "3 — normal funny", "4 — pretty witty", "5 — maximum comedy chaos"],
    tags: ["identity", "starman", "persona", "tone"],
    priority: 91,
    variations: [
      { text: "Humor dial: 1 is Wikipedia, 5 is stand-up comedian having a breakdown. Set it 🎚️", tone: "witty" },
    ],
  },
  {
    text: "How wordy should I be?",
    domain: "user",
    category: "starman_verbosity",
    format: "mcq",
    options: ["1 — three words max", "2 — short and sweet", "3 — balanced", "4 — detailed when needed", "5 — walls of text, I read everything"],
    tags: ["identity", "starman", "persona", "tone"],
    priority: 90,
    variations: [
      { text: "Do you want me to be concise 🏃 or thorough 📖? Pick your fighter", tone: "chill" },
    ],
  },

  // ══════════════════════════════════════════
  // 🌍 UNIVERSE QUESTIONS (Campus Knowledge)
  // ══════════════════════════════════════════
  {
    text: "Your honest ranking: Best momos on campus?",
    domain: "universe",
    category: "food",
    format: "mcq",
    options: ["Maggi King behind Gate 3", "Momos Point near library", "Night canteen special", "Other"],
    tags: ["food", "momos", "campus"],
    variations: [
      { text: "Drop the real momo truth bomb — who's the campus momo king? 🥟", tone: "witty" },
      { text: "Best momos on campus? Think carefully, your answer has consequences. 🥟", tone: "meme" },
    ],
  },
  {
    text: "Where do couples usually hang out on campus?",
    domain: "universe",
    category: "hangout",
    format: "mcq",
    options: ["Library terrace", "Garden area", "Cafeteria corner", "Behind the sports complex"],
    tags: ["couples", "hangout", "campus", "social"],
    variations: [
      { text: "Where do lovebirds usually nest on campus? 🐦 (asking for research purposes)", tone: "witty" },
    ],
  },
  {
    text: "Best spot to cry after results?",
    domain: "universe",
    category: "campus_life",
    format: "mcq",
    options: ["Library washroom", "Hostel terrace", "Empty classroom", "Behind the mess"],
    tags: ["results", "campus", "relatable"],
    variations: [
      { text: "Best spot to cry after results? Asking for a friend 😭", tone: "meme" },
    ],
  },
  {
    text: "If this campus was a Bollywood movie, which one?",
    domain: "universe",
    category: "culture",
    format: "short",
    options: [],
    tags: ["bollywood", "campus", "fun", "culture"],
    variations: [
      { text: "If our campus was a Bollywood movie, which one would it be? 🎬", tone: "chill" },
    ],
  },
  {
    text: "Rate the Wi-Fi. You know the drill.",
    domain: "universe",
    category: "infrastructure",
    format: "rating",
    options: ["1", "2", "3", "4", "5"],
    tags: ["wifi", "campus", "infrastructure"],
    variations: [
      { text: "Rate the campus Wi-Fi. We both know the answer, but say it anyway. 📶", tone: "meme" },
    ],
  },
  {
    text: "What's the campus midnight snack hack most people don't know?",
    domain: "universe",
    category: "food",
    format: "short",
    options: [],
    tags: ["food", "midnight", "hack", "campus"],
    variations: [
      { text: "Drop your midnight snack hack that only real campus veterans know 🌙", tone: "chill" },
    ],
  },
  {
    text: "Best prof to take a selfie with — who?",
    domain: "universe",
    category: "academics",
    format: "short",
    options: [],
    tags: ["professor", "selfie", "fun", "campus"],
    variations: [
      { text: "Which prof would you trust to take a fire selfie with? 📸", tone: "witty" },
    ],
  },
  {
    text: "Gate chowmein vs canteen maggi — your pick?",
    domain: "universe",
    category: "food",
    format: "mcq",
    options: ["Gate chowmein all the way", "Canteen maggi forever", "Both are mid", "Neither, I cook my own"],
    tags: ["food", "chowmein", "maggi", "campus"],
    variations: [
      { text: "The eternal debate: gate chowmein or canteen maggi? Choose wisely 🍜", tone: "witty" },
    ],
  },
  {
    text: "How many Nescafé outlets exist on campus?",
    domain: "universe",
    category: "campus_trivia",
    format: "short",
    options: [],
    tags: ["nescafe", "coffee", "campus", "trivia"],
    variations: [
      { text: "How many Nescafé outlets on campus? (Be honest, no Googling) ☕", tone: "chill" },
    ],
  },
  {
    text: "Best bunking spot on campus. No judgement.",
    domain: "universe",
    category: "campus_life",
    format: "mcq",
    options: ["Library (ironic I know)", "Parking area", "Rooftop", "That one empty lab everyone knows about"],
    tags: ["bunking", "campus", "relatable"],
    variations: [
      { text: "Where's the GOAT bunking spot? No judgement zone 🫣", tone: "meme" },
    ],
  },
  {
    text: "The unofficial campus anthem is ___",
    domain: "universe",
    category: "culture",
    format: "short",
    options: [],
    tags: ["music", "anthem", "campus", "culture"],
    variations: [
      { text: "Name the unofficial campus anthem. The one everyone hums 🎵", tone: "chill" },
    ],
  },
  {
    text: "Best sunset view on campus?",
    domain: "universe",
    category: "hangout",
    format: "mcq",
    options: ["Hostel terrace", "Sports ground", "Library rooftop", "Admin building garden"],
    tags: ["sunset", "view", "campus", "aesthetic"],
    variations: [
      { text: "Best sunset spot on campus? Asking for my next Instagram story 🌅", tone: "witty" },
    ],
  },
  {
    text: "Rate the hostel food. We dare you.",
    domain: "universe",
    category: "food",
    format: "rating",
    options: ["1", "2", "3", "4", "5"],
    tags: ["hostel", "food", "campus", "mess"],
    variations: [
      { text: "Rate the hostel food. Be brutally honest 🍽️", tone: "meme" },
    ],
  },
  {
    text: "What's the one thing every fresher should know about this campus?",
    domain: "universe",
    category: "campus_life",
    format: "short",
    options: [],
    tags: ["fresher", "advice", "campus", "tips"],
    variations: [
      { text: "One survival tip for freshers. What would you tell your Day 1 self? 🎓", tone: "serious" },
    ],
  },
  {
    text: "Best place for a late-night walk on campus?",
    domain: "universe",
    category: "hangout",
    format: "mcq",
    options: ["Around the sports complex", "Garden pathway", "Main road loop", "Near the lake/pond"],
    tags: ["night", "walk", "campus", "peaceful"],
    variations: [
      { text: "Where do you go for those 2 AM existential crisis walks? 🌙", tone: "meme" },
    ],
  },

  // ══════════════════════════════════════════
  // 👤 USER QUESTIONS (Personal Intelligence)
  // ══════════════════════════════════════════
  {
    text: "What's your love language?",
    domain: "user",
    category: "personality",
    format: "mcq",
    options: ["Words of affirmation", "Quality time", "Physical touch", "Acts of service", "Gifts"],
    tags: ["love_language", "personality", "relationships"],
    variations: [
      { text: "What's your love language? (don't overthink it) 💌", tone: "chill" },
    ],
  },
  {
    text: "If you could only eat one meal forever, what is it?",
    domain: "user",
    category: "preferences",
    format: "short",
    options: [],
    tags: ["food", "preferences", "fun"],
    variations: [
      { text: "One meal forever. No exceptions. What is it? 🍕", tone: "witty" },
    ],
  },
  {
    text: "Your screen time today — be honest.",
    domain: "user",
    category: "habits",
    format: "mcq",
    options: ["Under 2 hours (liar)", "2-4 hours", "4-6 hours", "6-8 hours", "8+ hours (respect)"],
    tags: ["screen_time", "habits", "digital"],
    variations: [
      { text: "Drop your screen time. No cap. ⏰", tone: "meme" },
    ],
  },
  {
    text: "Career plan: Startup, corporate, or 'figuring it out'?",
    domain: "user",
    category: "career",
    format: "mcq",
    options: ["Startup hustle 🚀", "Corporate ladder 💼", "Freelancing/creative", "Figuring it out 🤷"],
    tags: ["career", "goals", "future"],
    variations: [
      { text: "What's the career vibe? Startup energy, corporate stability, or vibes-based planning? 🚀", tone: "witty" },
    ],
  },
  {
    text: "What's one skill you'd learn if sleep didn't exist?",
    domain: "user",
    category: "aspirations",
    format: "short",
    options: [],
    tags: ["skills", "learning", "aspirations"],
    variations: [
      { text: "If sleep was deleted from the human experience, what skill are you learning first? 💤", tone: "witty" },
    ],
  },
  {
    text: "Your personality in exactly 3 emojis — go!",
    domain: "user",
    category: "personality",
    format: "short",
    options: [],
    tags: ["personality", "emoji", "fun", "self_expression"],
    variations: [
      { text: "Describe yourself in 3 emojis. No more, no less 🎭", tone: "chill" },
    ],
  },
  {
    text: "Night owl or morning person?",
    domain: "user",
    category: "habits",
    format: "mcq",
    options: ["Night owl 🦉", "Morning person 🌅", "Depends on the deadline 😅", "Neither, I'm always tired"],
    tags: ["sleep", "habits", "lifestyle"],
    variations: [
      { text: "Be honest: night owl 🦉 or morning vibes 🌅?", tone: "chill" },
    ],
  },
  {
    text: "The last song you played on loop?",
    domain: "user",
    category: "preferences",
    format: "short",
    options: [],
    tags: ["music", "preferences", "mood"],
    variations: [
      { text: "Drop the last song you absolutely demolished the replay button on 🎵", tone: "meme" },
    ],
  },
  {
    text: "If you could swap lives with anyone for a day, who?",
    domain: "user",
    category: "aspirations",
    format: "short",
    options: [],
    tags: ["dreams", "aspirations", "fun"],
    variations: [
      { text: "24-hour life swap. Pick your character. Who are you becoming? 🔄", tone: "witty" },
    ],
  },
  {
    text: "Your biggest flex that nobody knows about?",
    domain: "user",
    category: "personality",
    format: "short",
    options: [],
    tags: ["flex", "hidden_talent", "personality"],
    variations: [
      { text: "Drop your biggest flex that absolutely nobody knows about 💪", tone: "meme" },
    ],
  },
  {
    text: "Dream company to work at? (Or start?)",
    domain: "user",
    category: "career",
    format: "short",
    options: [],
    tags: ["career", "dreams", "company"],
    variations: [
      { text: "Dream company — or are you the one starting it? 💼", tone: "witty" },
    ],
  },
  {
    text: "Are you a 'plan every detail' or 'wing it' person?",
    domain: "user",
    category: "personality",
    format: "mcq",
    options: ["Plan everything 📋", "Wing it always 🦅", "Plan it then wing it anyway", "Depends on the stakes"],
    tags: ["personality", "planning", "style"],
    variations: [
      { text: "Planner 📋 or chaos agent 🦅? Choose your fighter.", tone: "meme" },
    ],
  },
  {
    text: "What's your campus vibe?",
    domain: "user",
    category: "social",
    format: "mcq",
    options: ["Library rat 📚", "Café crawler ☕", "Event hopper 🎉", "Ghost mode 👻"],
    tags: ["campus", "social", "lifestyle", "vibe"],
    variations: [
      { text: "What kind of campus creature are you? Library rat, café crawler, or event hopper? 📚", tone: "witty" },
    ],
  },
  {
    text: "Rate your cooking skills. Be honest.",
    domain: "user",
    category: "skills",
    format: "rating",
    options: ["1", "2", "3", "4", "5"],
    tags: ["cooking", "skills", "self_rating"],
    variations: [
      { text: "Your cooking skills on a scale of 'instant noodles' to 'MasterChef' 👨‍🍳", tone: "witty" },
    ],
  },
  {
    text: "One thing on your bucket list before graduation?",
    domain: "user",
    category: "aspirations",
    format: "short",
    options: [],
    tags: ["bucket_list", "graduation", "goals"],
    variations: [
      { text: "Before that cap flies — what's the ONE thing you absolutely MUST do? 🎓", tone: "chill" },
    ],
  },
];

// ── Export for programmatic use or run directly ──

module.exports = seedQuestions;

// If run directly: POST to the Question Service seed endpoint
if (require.main === module) {
  const axios = require("axios");
  const jwt = require("jsonwebtoken");

  const QUESTION_URL =
    process.env.QUESTION_URL || "http://localhost:6030/question/api/v1";
  const ACCESS_TOKEN_SECRET =
    process.env.ACCESS_TOKEN_SECRET ||
    "61c9e741011410b4b54f8628adc6706d1468be91a2ad8de7f8404d44be5234a144590bacfb58cb6fbb182cb3d40d2d356a9c4beb7ff3a95877f9d483624672b4";

  const token = jwt.sign(
    { role: "internal", service: "seed-script" },
    ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" }
  );

  async function seed() {
    try {
      const res = await axios.post(
        `${QUESTION_URL}/seed`,
        { questions: seedQuestions },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      console.log("✅ Seed complete:", res.data);
    } catch (err) {
      console.error(
        "❌ Seed failed:",
        err.response?.data || err.message
      );
    }
  }

  seed();
}
