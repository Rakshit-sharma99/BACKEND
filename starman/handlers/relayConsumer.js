/**
 * Signal Relay Consumer — Starman's autonomous community posting pipeline.
 *
 * Subscribes to `signal.relay.candidate` Kafka events from the Knowledge Service.
 * For each candidate:
 *   1. Rate-limit check (per entity + per university)
 *   2. Community matching (find best Macbease community)
 *   3. Post composition (LLM-written, attributed post)
 *   4. Post execution (content creation with externalSourceMetaData + community feed registration)
 */

const { Kafka, logLevel } = require("kafkajs");
const axios = require("axios");
const jwt = require("jsonwebtoken");

// ── Service URLs ──
const UNIVERSE_URL =
  process.env.UNIVERSE_URL || "http://universe:5050/universe/api/v1";
const CONTENT_URL =
  process.env.CONTENT_URL || "http://content:5000/content/api/v1";
const KNOWLEDGE_URL =
  process.env.KNOWLEDGE_URL || "http://knowledge:7080/knowledge/api/v1";

// ── Bot identity ──
const BOT_USER_ID = process.env.STARMAN_BOT_USER_ID || null;

// ── Rate limits (⚡ TESTING MODE: all disabled) ──
const RATE_LIMIT_PER_ENTITY_PER_DAY = 999999;
const RATE_LIMIT_PER_UNIVERSITY_PER_DAY = 999999;
const RATE_LIMIT_COOLDOWN_MS = 0; // no cooldown

// ── In-memory rate tracking ──
// entityId → { count: N, lastPostedAt: Date }
const entityRateMap = new Map();
// uid → { count: N, resetAt: Date }
const universityRateMap = new Map();

/**
 * Generate an internal JWT for service-to-service calls.
 */
function getInternalToken() {
  return jwt.sign(
    { role: "internal", service: "starman-relay" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
}

/**
 * Generate a user-impersonation token for the Starman bot.
 */
function getBotUserToken() {
  if (!BOT_USER_ID) return null;
  return jwt.sign(
    { id: BOT_USER_ID, role: "user" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
}

function internalHeaders() {
  return { Authorization: `Bearer ${getInternalToken()}` };
}

function botUserHeaders() {
  const token = getBotUserToken();
  if (!token) return internalHeaders();
  return { Authorization: `Bearer ${token}` };
}

// ── Rate Limiter ──

/**
 * Check if a relay is allowed under rate limits.
 * Returns { allowed: true } or { allowed: false, reason: "..." }
 */
function checkRateLimit(entityId, uid) {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  // ── Entity rate limit ──
  const entityState = entityRateMap.get(entityId) || {
    count: 0,
    lastPostedAt: 0,
    resetAt: todayMs,
  };

  // Reset daily counter
  if (entityState.resetAt < todayMs) {
    entityState.count = 0;
    entityState.resetAt = todayMs + 24 * 60 * 60 * 1000;
  }

  if (entityState.count >= RATE_LIMIT_PER_ENTITY_PER_DAY) {
    return {
      allowed: false,
      reason: `Entity daily limit reached (${RATE_LIMIT_PER_ENTITY_PER_DAY}/day)`,
    };
  }

  if (now - entityState.lastPostedAt < RATE_LIMIT_COOLDOWN_MS) {
    const minutesLeft = Math.ceil(
      (RATE_LIMIT_COOLDOWN_MS - (now - entityState.lastPostedAt)) / 60000,
    );
    return {
      allowed: false,
      reason: `Entity cooldown active (${minutesLeft} min remaining)`,
    };
  }

  // ── University rate limit ──
  const uniState = universityRateMap.get(uid) || {
    count: 0,
    resetAt: todayMs,
  };

  if (uniState.resetAt < todayMs) {
    uniState.count = 0;
    uniState.resetAt = todayMs + 24 * 60 * 60 * 1000;
  }

  if (uniState.count >= RATE_LIMIT_PER_UNIVERSITY_PER_DAY) {
    return {
      allowed: false,
      reason: `University daily limit reached (${RATE_LIMIT_PER_UNIVERSITY_PER_DAY}/day)`,
    };
  }

  return { allowed: true };
}

/**
 * Record a successful relay for rate tracking.
 */
function recordRelay(entityId, uid) {
  const now = Date.now();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMs = todayStart.getTime();

  const entityState = entityRateMap.get(entityId) || {
    count: 0,
    lastPostedAt: 0,
    resetAt: todayMs + 24 * 60 * 60 * 1000,
  };
  entityState.count++;
  entityState.lastPostedAt = now;
  entityRateMap.set(entityId, entityState);

  const uniState = universityRateMap.get(uid) || {
    count: 0,
    resetAt: todayMs + 24 * 60 * 60 * 1000,
  };
  uniState.count++;
  universityRateMap.set(uid, uniState);
}

// ── Community Matcher ──

/**
 * Find the best Macbease community to post a relay entry into.
 * Extracts keywords from the entry text and searches.
 *
 * @returns {{ communityId, communityName } | null}
 */
async function findBestCommunity(entry, uid) {
  try {
    const keywords = extractKeywords(entry.text, entry.category);

    console.log(
      `🔍 [SignalRelay] Searching communities for keywords: "${keywords}" (uid: ${uid})`,
    );

    const res = await axios.get(`${UNIVERSE_URL}/community/searchCommunities`, {
      params: { query: keywords, uid },
      headers: internalHeaders(),
    });

    const communities = Array.isArray(res.data) ? res.data : [];

    if (communities.length === 0) {
      console.log(
        `🔍 [SignalRelay] No communities found for keywords "${keywords}"`,
      );
      return null;
    }

    const best = communities[0];
    console.log(
      `🔍 [SignalRelay] Matched community: "${best.title || best.name}" (id: ${best._id})`,
    );

    return {
      communityId: (best._id || best.id).toString(),
      communityName: best.title || best.name,
    };
  } catch (err) {
    console.error(`❌ [SignalRelay] Community search failed:`, err.message);
    return null;
  }
}

/**
 * Extract search keywords from entry text for community matching.
 */
function extractKeywords(text, category) {
  const stopWords = new Set([
    "the",
    "a",
    "an",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "shall",
    "can",
    "to",
    "of",
    "in",
    "for",
    "on",
    "with",
    "at",
    "by",
    "from",
    "as",
    "into",
    "about",
    "like",
    "through",
    "after",
    "before",
    "between",
    "under",
    "above",
    "up",
    "out",
    "off",
    "over",
    "and",
    "but",
    "or",
    "not",
    "no",
    "so",
    "if",
    "then",
    "than",
    "too",
    "very",
    "just",
    "also",
    "it",
    "its",
    "this",
    "that",
    "these",
    "those",
    "i",
    "you",
    "he",
    "she",
    "we",
    "they",
    "me",
    "him",
    "her",
    "us",
    "them",
    "my",
    "your",
    "his",
    "our",
    "their",
    "all",
    "each",
    "every",
    "both",
    "few",
    "more",
    "most",
    "other",
    "some",
    "such",
    "only",
    "same",
    "so",
    "don't",
    "bring",
  ]);

  const words = text
    .replace(/[^a-zA-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopWords.has(w.toLowerCase()))
    .slice(0, 5);

  return words.join(" ");
}

// ── Post Composer ──

const CATEGORY_EMOJI = {
  deadlines: "⏰",
  announcements: "📢",
  resources: "📚",
  decisions: "⚖️",
  summaries: "📋",
};

/**
 * Rewrite a relay post with personality — humour, satire, irony, metaphor.
 * Uses the LLM to transform the dry distilled text into something that
 * grabs attention on a campus feed, and generates a quirky title.
 *
 * Falls back to the original text if the LLM call fails.
 */
async function composeRelayPost(entry, entityName) {
  const emoji = CATEGORY_EMOJI[entry.category] || "📡";
  const dateStr = entry.date ? `\n📅 ${entry.date}` : "";
  const urlStr = entry.url ? `\n🔗 ${entry.url}` : "";

  // ── Fallback (used if LLM fails) ──
  const fallbackText = `${emoji} ${entry.text}${dateStr}${urlStr}\n\n— Relayed from "${entityName}"`;

  try {
    const { OpenAI } = require("openai");
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a witty campus social media writer. Your job is to take a dry, factual piece of information from a WhatsApp group and rewrite it as an attention-grabbing post for a college community feed.

Rules:
- Generate a SHORT, QUIRKY title (max 10 words). It should use wordplay, satire, pop-culture references, Gen-Z humour, irony, or metaphor. Think tweet-worthy headlines.
- Rewrite the body text to be engaging and funny while preserving ALL factual details (dates, names, links, deadlines). Never omit or change facts.
- Use wit, sarcasm, relatable college humour, or dramatic exaggeration — but keep it respectful and campus-appropriate.
- Keep the rewritten text concise — 2-5 sentences max.
- Add 1-2 relevant emojis naturally (not at the start like a template).
- End with a small attribution line: "— via ${entityName}"
- Do NOT use hashtags, greetings, or "Dear students" style openings.

Respond in EXACTLY this JSON format (no markdown, no code fences):
{"title": "your quirky title here", "text": "your rewritten engaging body text here"}`,
        },
        {
          role: "user",
          content: `Category: ${entry.category || "general"}
Original text: ${entry.text}${entry.date ? `\nDate/Deadline: ${entry.date}` : ""}${entry.url ? `\nLink: ${entry.url}` : ""}`,
        },
      ],
      response_format: { type: "json_object" },
      max_tokens: 300,
      temperature: 0.9,
    });

    const raw = completion?.choices?.[0]?.message?.content || "";

    // Parse the JSON response
    let parsed;
    try {
      // Strip any accidental markdown fences
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      parsed = JSON.parse(cleaned);
    } catch (parseErr) {
      console.warn(
        `⚠️ [SignalRelay] LLM returned non-JSON, falling back. Raw: "${raw.slice(0, 200)}"`,
      );
      return { title: "", text: fallbackText };
    }

    const title = (parsed.title || "").trim();
    const text = (parsed.text || "").trim();

    if (!text) {
      console.warn(`⚠️ [SignalRelay] LLM returned empty text, falling back.`);
      return { title: "", text: fallbackText };
    }

    console.log(
      `✍️ [SignalRelay] Composed quirky post — title: "${title}" | text (${text.length} chars): "${text.slice(0, 120)}..."`,
    );

    return { title, text };
  } catch (llmErr) {
    console.warn(
      `⚠️ [SignalRelay] LLM rewrite failed, using original text: ${llmErr.message}`,
    );
    return { title: "", text: fallbackText };
  }
}

// ── Post Executor ──

/**
 * Create content with externalSourceMetaData and register it in a community's feed.
 */
async function executePost(communityId, communityName, composed, relayMeta) {
  if (!BOT_USER_ID) {
    console.error(
      `❌ [SignalRelay] STARMAN_BOT_USER_ID not configured — cannot post`,
    );
    return null;
  }

  try {
    // 1. Auto-join bot to the community (idempotent)
    try {
      await axios.post(
        `${UNIVERSE_URL}/community/joinAsMember`,
        { communityId },
        { headers: botUserHeaders() },
      );
      console.log(`👤 [SignalRelay] Bot joined community "${communityName}"`);
    } catch (joinErr) {
      console.log(
        `👤 [SignalRelay] Bot join skipped: ${joinErr?.response?.data || joinErr.message}`,
      );
    }

    // 2. Create the content document with externalSourceMetaData
    const postRes = await axios.post(
      `${CONTENT_URL}/createContent`,
      {
        contentType: "text",
        sendBy: "userCommunity",
        url: "",
        text: composed.text,
        title: composed.title || "",
        belongsTo: communityId,
        peopleTagged: [],
        universeMetaData: {},
        tags: ["starman-relay"],
        externalSourceMetaData: {
          entityId: relayMeta.entityId,
          entityName: relayMeta.entityName,
          platform: relayMeta.platform,
          category: relayMeta.category,
          originalText: relayMeta.originalText,
          relayScore: relayMeta.relayScore,
          relayedBy: "starman-bot",
        },
      },
      { headers: botUserHeaders() },
    );

    const contentId = postRes.data?.contentId || null;
    console.log(`📝 [SignalRelay] Content created: ${contentId}`);

    // 3. Register in community feed
    if (contentId) {
      await axios.post(
        `${UNIVERSE_URL}/community/post`,
        {
          contentId,
          communityId,
          contentType: "text",
        },
        { headers: botUserHeaders() },
      );
      console.log(
        `✅ [SignalRelay] Post registered in community "${communityName}" feed`,
      );

      // 4. Save contentId to the entity's context file in the Knowledge Service
      try {
        await axios.post(
          `${KNOWLEDGE_URL}/external/save-relayed-content`,
          {
            uid: relayMeta.uid,
            entityId: relayMeta.entityId,
            contentId,
          },
          { headers: internalHeaders() },
        );
        console.log(
          `📌 [SignalRelay] Saved contentId ${contentId} to entity context for "${relayMeta.entityName}"`,
        );
      } catch (saveErr) {
        console.error(
          `⚠️ [SignalRelay] Failed to save contentId to entity context:`,
          saveErr?.response?.data || saveErr.message,
        );
      }
    }

    return contentId;
  } catch (err) {
    console.error(
      `❌ [SignalRelay] Post execution failed for "${communityName}":`,
      err.message,
    );
    return null;
  }
}

// ── Main Relay Handler ──

/**
 * Process a single signal.relay.candidate event end-to-end.
 */
async function handleRelayCandidate(eventData) {
  const { uid, entityId, entityName, platform, entry } = eventData;

  console.log(
    `\n${"═".repeat(60)}\n📡 [SignalRelay] Processing candidate from "${entityName}"\n` +
      `   Universe: ${uid} | Category: ${entry.category} | Score: ${entry.relayScore} | Platform: ${platform}\n` +
      `   Text: "${entry.text.slice(0, 100)}${entry.text.length > 100 ? "..." : ""}"\n` +
      `${"═".repeat(60)}`,
  );

  // ── Step 1: Rate limit check ──
  const rateCheck = checkRateLimit(entityId, uid);
  if (!rateCheck.allowed) {
    console.log(
      `🚫 [SignalRelay] Rate limited: ${rateCheck.reason} — skipping`,
    );
    return;
  }

  // ── Step 2: Community matching ──
  console.log(`🔍 [SignalRelay] Step 2: Finding best community...`);
  const match = await findBestCommunity(entry, uid);

  if (!match) {
    console.log(`🚫 [SignalRelay] No matching community found — skipping`);
    return;
  }

  // ── Step 3: Compose post ──
  console.log(
    `✍️ [SignalRelay] Step 3: Composing post for "${match.communityName}"...`,
  );
  const composedPost = await composeRelayPost(entry, entityName);

  // ── Step 4: Execute post with externalSourceMetaData ──
  console.log(
    `🚀 [SignalRelay] Step 4: Posting to "${match.communityName}" (${match.communityId})...`,
  );
  const contentId = await executePost(
    match.communityId,
    match.communityName,
    composedPost,
    {
      uid,
      entityId,
      entityName,
      platform,
      category: entry.category,
      originalText: entry.text,
      relayScore: entry.relayScore,
    },
  );

  // ── Step 5: Record relay in rate counters ──
  if (contentId) {
    recordRelay(entityId, uid);
    console.log(
      `\n✅ [SignalRelay] SUCCESS: Relayed "${entry.text.slice(0, 60)}..." → "${match.communityName}" (content: ${contentId})\n`,
    );
  } else {
    console.log(`❌ [SignalRelay] FAILED: Could not post relay content`);
  }
}

// ── Kafka Consumer Setup ──

/**
 * Start the Signal Relay Kafka consumer.
 * Should be called once during Starman boot.
 */
async function startRelayConsumer() {
  if (!BOT_USER_ID) {
    console.warn(
      `⚠️ [SignalRelay] STARMAN_BOT_USER_ID not set — relay consumer DISABLED. ` +
        `Set this env var to enable autonomous posting.`,
    );
    return;
  }

  const kafka = new Kafka({
    clientId: "starman-relay",
    brokers: [process.env.KAFKA_BROKER || "kafka:9092"],
    logLevel: logLevel.WARN,
    retry: {
      initialRetryTime: 3000,
      retries: 10,
    },
  });

  const consumer = kafka.consumer({ groupId: "starman-relay-group" });

  console.log(`⏳ [SignalRelay] Connecting Kafka consumer...`);

  while (true) {
    try {
      await consumer.connect();
      console.log(`✅ [SignalRelay] Kafka consumer connected`);

      await consumer.subscribe({ topic: "signal.relay.candidate" });

      await consumer.run({
        eachMessage: async ({ topic, partition, message }) => {
          try {
            const eventData = JSON.parse(message.value.toString());
            console.log(
              `📨 [SignalRelay] Received candidate event from "${eventData.entityName || "unknown"}"`,
            );
            await handleRelayCandidate(eventData);
          } catch (err) {
            console.error(
              `❌ [SignalRelay] Error processing relay event:`,
              err.message,
            );
          }
        },
      });

      console.log(
        `📡 [SignalRelay] Consumer running — listening for signal.relay.candidate events\n` +
          `   Rate limits: ${RATE_LIMIT_PER_ENTITY_PER_DAY}/entity/day, ${RATE_LIMIT_PER_UNIVERSITY_PER_DAY}/university/day\n` +
          `   Cooldown: ${RATE_LIMIT_COOLDOWN_MS / 60000} min between posts from same entity\n` +
          `   Bot user: ${BOT_USER_ID}`,
      );

      break;
    } catch (error) {
      console.error(
        `❌ [SignalRelay] Kafka consumer connection failed. Retrying in 5s...`,
        error.message,
      );
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}

module.exports = { startRelayConsumer };
