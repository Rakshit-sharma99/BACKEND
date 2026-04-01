/**
 * Distillation Helper — uses Gemini to extract structured knowledge
 * from raw external network messages (WhatsApp, Discord, Telegram).
 */

const {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
} = require("@google/generative-ai");

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

Return a valid JSON object with this structure:
{
  "deadlines": [{ "text": "...", "date": "YYYY-MM-DD or null" }],
  "announcements": [{ "text": "..." }],
  "resources": [{ "text": "...", "url": "extracted URL or null" }],
  "decisions": [{ "text": "..." }],
  "summaries": [{ "text": "..." }]
}

Rules:
- Only extract MEANINGFUL, ACTIONABLE information. Skip casual chat, greetings, and noise.
- Keep each entry concise (1-2 sentences max).
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
        { role: "model", parts: [{ text: "Understood. Send me the messages and I will extract structured knowledge as JSON." }] },
        { role: "user", parts: [{ text: prompt }] },
      ],
      generationConfig: {
        maxOutputTokens: 4096,
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

module.exports = { distillMessages, batchDistill };
