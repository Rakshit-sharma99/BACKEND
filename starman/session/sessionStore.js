/**
 * Session Store — Redis-backed with MongoDB conversation persistence.
 *
 * Architecture:
 *   Redis (ioredis)  → Hot session data (history, lastResults) with 30-min TTL
 *   MongoDB          → Durable conversation log (survives restarts, 30-day TTL)
 *
 * On session create/update → write to Redis + async persist to MongoDB
 * On session load → try Redis first, fallback to MongoDB for warm context
 */

const crypto = require("crypto");
const Redis = require("ioredis");
const Conversation = require("../models/conversationModel");

// ── Redis Client ──
const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

redis.on("connect", () => console.log("✅ SessionStore Redis connected"));
redis.on("error", (err) => console.error("❌ SessionStore Redis error:", err.message));

const SESSION_TTL = 30 * 60; // 30 minutes in seconds
const SESSION_PREFIX = "starman:session:";

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────

function sessionKey(sessionId) {
  return `${SESSION_PREFIX}${sessionId}`;
}

async function setSessionInRedis(session) {
  const key = sessionKey(session.sessionId);
  await redis.setex(key, SESSION_TTL, JSON.stringify(session));
}

async function getSessionFromRedis(sessionId) {
  const key = sessionKey(sessionId);
  const raw = await redis.get(key);
  if (!raw) return null;

  // Refresh TTL on access
  await redis.expire(key, SESSION_TTL);
  return JSON.parse(raw);
}

// ────────────────────────────────────────────────
// Core API
// ────────────────────────────────────────────────

async function createSession(userId) {
  const sessionId = `s_${crypto.randomBytes(8).toString("hex")}`;
  const session = {
    sessionId,
    userId,
    history: [],
    lastResults: null,
    createdAt: Date.now(),
    lastActive: Date.now(),
  };

  // Write to Redis
  await setSessionInRedis(session);

  // Create MongoDB conversation record (async, don't block)
  Conversation.create({
    userId,
    sessionId,
    messages: [],
    title: "New Chat",
  }).catch((err) =>
    console.error("[SessionStore] MongoDB create failed:", err.message),
  );

  return session;
}

async function getSession(sessionId) {
  // Try Redis first (hot path)
  let session = await getSessionFromRedis(sessionId);
  if (session) return session;

  // Fallback to MongoDB (warm context after restart)
  try {
    const conversation = await Conversation.findOne({ sessionId }).lean();
    if (!conversation) return null;

    // Rebuild session from MongoDB
    session = {
      sessionId: conversation.sessionId,
      userId: conversation.userId.toString(),
      history: conversation.messages.map((m) => ({
        role: m.role,
        parts: [{ text: m.text }],
      })),
      lastResults: null,
      createdAt: new Date(conversation.createdAt).getTime(),
      lastActive: new Date(conversation.lastActive).getTime(),
    };

    // Re-hydrate into Redis for subsequent requests
    await setSessionInRedis(session);
    return session;
  } catch (err) {
    console.error("[SessionStore] MongoDB fallback failed:", err.message);
    return null;
  }
}

async function getOrCreateSession(sessionId, userId) {
  if (sessionId) {
    const existing = await getSession(sessionId);
    if (existing) return existing;
  }
  return createSession(userId);
}

async function updateHistory(sessionId, userMessage, modelResponse) {
  let session = await getSessionFromRedis(sessionId);
  if (!session) return;

  session.history.push({
    role: "user",
    parts: [{ text: userMessage }],
  });
  session.history.push({
    role: "model",
    parts: [{ text: modelResponse }],
  });

  // Keep only the last 20 turns (10 exchanges) to control token usage
  if (session.history.length > 20) {
    session.history = session.history.slice(-20);
  }

  session.lastActive = Date.now();
  await setSessionInRedis(session);

  // Persist to MongoDB (async, don't block the SSE response)
  Conversation.findOneAndUpdate(
    { sessionId },
    {
      $push: {
        messages: {
          $each: [
            { role: "user", text: userMessage, timestamp: new Date() },
            { role: "model", text: modelResponse, timestamp: new Date() },
          ],
        },
      },
      $set: { lastActive: new Date() },
    },
    { upsert: true },
  ).catch((err) =>
    console.error("[SessionStore] MongoDB update failed:", err.message),
  );

  // Auto-generate title from first user message
  Conversation.findOne({ sessionId }).then((conv) => {
    if (conv && conv.title === "New Chat" && conv.messages.length <= 2) {
      const title =
        userMessage.length > 60
          ? userMessage.substring(0, 57) + "..."
          : userMessage;
      conv.title = title;
      conv.save().catch(() => {});
    }
  }).catch(() => {});
}

async function setLastResults(sessionId, results) {
  let session = await getSessionFromRedis(sessionId);
  if (session) {
    session.lastResults = results;
    await setSessionInRedis(session);
  }
}

async function deleteSession(sessionId) {
  await redis.del(sessionKey(sessionId));
}

/**
 * Get conversation history for a user (for chat history UI).
 * Returns a list of conversations with metadata (no full messages).
 */
async function getUserConversations(userId, { limit = 20, skip = 0 } = {}) {
  return Conversation.find({ userId })
    .select("sessionId title lastActive createdAt messages")
    .sort({ lastActive: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .then((convs) =>
      convs.map((c) => ({
        sessionId: c.sessionId,
        title: c.title,
        lastActive: c.lastActive,
        createdAt: c.createdAt,
        messageCount: c.messages?.length || 0,
        lastMessage: c.messages?.[c.messages.length - 1]?.text?.substring(0, 100) || null,
      })),
    );
}

/**
 * Get full conversation by sessionId (for loading chat history).
 */
async function getConversation(sessionId) {
  return Conversation.findOne({ sessionId }).lean();
}

module.exports = {
  createSession,
  getSession,
  getOrCreateSession,
  updateHistory,
  setLastResults,
  deleteSession,
  getUserConversations,
  getConversation,
};
