/**
 * In-memory session store.
 * Replace with Redis (ioredis) for production.
 *
 * Each session stores:
 *  - history: Gemini conversation history (roles + parts)
 *  - lastResults: results from last tool call (for follow-up references)
 *  - createdAt / lastActive: timestamps
 */

const crypto = require("crypto");

// In-memory store (swap for Redis in prod)
const sessions = new Map();
const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function createSession(userId) {
  const sessionId = `s_${crypto.randomBytes(8).toString("hex")}`;
  const session = {
    sessionId,
    userId,
    history: [],
    lastResults: null,
    createdAt: Date.now(),
    lastActive: Date.now(),
  };
  sessions.set(sessionId, session);
  return session;
}

function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;

  // Check TTL
  if (Date.now() - session.lastActive > SESSION_TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }

  session.lastActive = Date.now();
  return session;
}

function getOrCreateSession(sessionId, userId) {
  if (sessionId) {
    const existing = getSession(sessionId);
    if (existing) return existing;
  }
  return createSession(userId);
}

function updateHistory(sessionId, userMessage, modelResponse) {
  const session = sessions.get(sessionId);
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
}

function setLastResults(sessionId, results) {
  const session = sessions.get(sessionId);
  if (session) {
    session.lastResults = results;
  }
}

function deleteSession(sessionId) {
  sessions.delete(sessionId);
}

// Cleanup expired sessions every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.lastActive > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

module.exports = {
  createSession,
  getSession,
  getOrCreateSession,
  updateHistory,
  setLastResults,
  deleteSession,
};
