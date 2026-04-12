/**
 * Distillation Helper — uses Gemini to extract structured knowledge
 * from raw external network messages (WhatsApp, Discord, Telegram).
 *
 * Also scores each entry for "relay worthiness" — whether it should
 * be automatically posted to a Macbease community by Starman.
 */

const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");
const crypto = require("crypto");

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

const DISTILLATION_PROMPT = `You are a knowledge extraction engine for a university campus assistant.

Given a batch of messages from an external platform (WhatsApp group, Discord server, or Telegram channel), extract structured knowledge entries.

Categorize each extracted piece of knowledge into EXACTLY one of these categories:
- deadlines: assignment due dates, exam schedules, registration deadlines, etc.
- announcements: official notices, event announcements, rule changes, etc.
- resources: shared links, documents, notes, study materials, etc.
- decisions: decisions made by admins/faculty, policy changes, etc.
- summaries: key discussion points, consensus reached, important context

For EACH entry, also assign a "relayScore" between 0.0 and 1.0 that indicates how important and useful this information would be if broadcast to ALL students at the university (not just members of this specific group).

relayScore guidelines:
- 0.9-1.0: Critical — exam dates, official university announcements, policy changes affecting all students
- 0.7-0.89: Important — assignment deadlines, event details with dates/venues, shared official resources
- 0.4-0.69: Moderate — group-specific discussions, informal resource sharing, minor updates
- 0.0-0.39: Low — casual chat, personal opinions, vague info, duplicates of common knowledge

Return a valid JSON object with this structure:
{
  "deadlines": [{ "text": "...", "date": "YYYY-MM-DD or null", "relayScore": 0.0 }],
  "announcements": [{ "text": "...", "relayScore": 0.0 }],
  "resources": [{ "text": "...", "url": "extracted URL or null", "relayScore": 0.0 }],
  "decisions": [{ "text": "...", "relayScore": 0.0 }],
  "summaries": [{ "text": "...", "relayScore": 0.0 }]
}

Rules:
- Only extract MEANINGFUL, ACTIONABLE information. Skip casual chat, greetings, and noise.
- Extract the FULL information for each entry — preserve all dates, times, locations, names, links, and instructions. Do NOT truncate or over-summarize.
- CRITICAL: Every "text" field MUST be a complete, self-contained statement. It must make full sense on its own. NEVER cut a sentence short or end abruptly mid-thought. If the source message is long, rephrase it concisely but ALWAYS end with a complete thought.
- If a message contains a URL, extract it into the resources category.
- If no meaningful information is found, return empty arrays for all categories.
- Return ONLY valid JSON, no markdown fences or extra text.`;

/**
 * Distill a batch of raw messages into structured knowledge.
 *
 * @param {Array<{text: string, sender: string, timestamp: number}>} messages
 * @param {string} entityName - Name of the community/group for context
 * @returns {object} - { deadlines, announcements, resources, decisions, summaries }
 */
async function distillMessages(messages, entityName) {
  if (!messages || messages.length === 0) {
    return {
      deadlines: [],
      announcements: [],
      resources: [],
      decisions: [],
      summaries: [],
    };
  }

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    safetySettings,
  });

  // Format messages for the LLM
  const formattedMessages = messages
    .map((m) => {
      const date = new Date(m.timestamp * 1000).toISOString().split("T")[0];
      return `[${date}] ${m.sender || "Unknown"}: ${m.text}`;
    })
    .join("\n");

  const prompt = `Community/Group: "${entityName}"\n\nMessages:\n${formattedMessages}`;

  try {
    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: DISTILLATION_PROMPT }] },
        { role: "model", parts: [{ text: "Understood. Send me the messages and I will extract structured knowledge as JSON with relayScore for each entry." }] },
        { role: "user", parts: [{ text: prompt }] },
      ],
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.2,
      },
    });

    const responseText = result.response.text().trim();

    // Strip markdown fences if present
    const jsonStr = responseText
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    const parsed = JSON.parse(jsonStr);

    return {
      deadlines: Array.isArray(parsed.deadlines) ? parsed.deadlines : [],
      announcements: Array.isArray(parsed.announcements)
        ? parsed.announcements
        : [],
      resources: Array.isArray(parsed.resources) ? parsed.resources : [],
      decisions: Array.isArray(parsed.decisions) ? parsed.decisions : [],
      summaries: Array.isArray(parsed.summaries) ? parsed.summaries : [],
    };
  } catch (err) {
    console.error(
      `[DistillationHelper] Error distilling messages for "${entityName}":`,
      err.message
    );
    return {
      deadlines: [],
      announcements: [],
      resources: [],
      decisions: [],
      summaries: [],
    };
  }
}

/**
 * Batch-distill a large array of messages.
 * Splits into chunks of BATCH_SIZE and distills each.
 *
 * @param {Array} messages - All messages to process
 * @param {string} entityName
 * @param {number} batchSize - Messages per LLM call (default 100)
 * @returns {object} - Merged distilled knowledge
 */
async function batchDistill(messages, entityName, batchSize = 100) {
  const merged = {
    deadlines: [],
    announcements: [],
    resources: [],
    decisions: [],
    summaries: [],
  };

  for (let i = 0; i < messages.length; i += batchSize) {
    const batch = messages.slice(i, i + batchSize);
    console.log(
      `[DistillationHelper] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(messages.length / batchSize)} (${batch.length} messages) for "${entityName}"`
    );

    const result = await distillMessages(batch, entityName);

    for (const category of Object.keys(merged)) {
      if (Array.isArray(result[category])) {
        merged[category].push(...result[category]);
      }
    }
  }

  return merged;
}

// ── Signal Relay: Content-hash dedup cache ──
// LRU-style cache to prevent re-relaying the same information.
// Key: SHA-256(entityId + entry.text), Value: timestamp
const RELAY_DEDUP_CACHE = new Map();
const RELAY_DEDUP_MAX_SIZE = 5000;
const RELAY_DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Generate a content hash for dedup purposes.
 */
function contentHash(entityId, text) {
  return crypto
    .createHash("sha256")
    .update(`${entityId}:${text}`)
    .digest("hex")
    .slice(0, 16); // 16 chars is plenty for dedup
}

/**
 * Filter distilled entries that are relay-worthy (relayScore ≥ 0.7)
 * and haven't been relayed before (dedup by content hash).
 *
 * @param {object} distilled - The distilled knowledge object
 * @param {string} entityId - External entity JID
 * @param {string} entityName - Human-readable entity name
 * @returns {Array<object>} - Relay candidate entries with category + metadata
 */
function filterRelayableEntries(distilled, entityId, entityName) {
  const RELAY_THRESHOLD = 0.7;
  const candidates = [];
  const now = Date.now();

  // Prune expired dedup entries
  for (const [key, ts] of RELAY_DEDUP_CACHE.entries()) {
    if (now - ts > RELAY_DEDUP_TTL_MS) {
      RELAY_DEDUP_CACHE.delete(key);
    }
  }

  // Enforce max cache size (evict oldest)
  if (RELAY_DEDUP_CACHE.size > RELAY_DEDUP_MAX_SIZE) {
    const entries = [...RELAY_DEDUP_CACHE.entries()].sort((a, b) => a[1] - b[1]);
    const toRemove = entries.slice(0, entries.length - RELAY_DEDUP_MAX_SIZE);
    for (const [key] of toRemove) {
      RELAY_DEDUP_CACHE.delete(key);
    }
  }

  for (const category of Object.keys(distilled)) {
    if (!Array.isArray(distilled[category])) continue;

    for (const entry of distilled[category]) {
      const score = typeof entry.relayScore === "number" ? entry.relayScore : 0;
      if (score < RELAY_THRESHOLD) continue;

      // Dedup check
      const hash = contentHash(entityId, entry.text);
      if (RELAY_DEDUP_CACHE.has(hash)) {
        console.log(
          `🔁 [SignalRelay] Skipping duplicate entry for "${entityName}": "${entry.text.slice(0, 60)}..."`
        );
        continue;
      }

      // Mark as relayed
      RELAY_DEDUP_CACHE.set(hash, now);

      candidates.push({
        text: entry.text,
        category,
        date: entry.date || null,
        url: entry.url || null,
        relayScore: score,
        source: entityName,
      });
    }
  }

  if (candidates.length > 0) {
    console.log(
      `📡 [SignalRelay] Found ${candidates.length} relay-worthy entries from "${entityName}" (scores: ${candidates.map((c) => c.relayScore.toFixed(2)).join(", ")})`
    );
  }

  return candidates;
}

module.exports = { distillMessages, batchDistill, filterRelayableEntries };
