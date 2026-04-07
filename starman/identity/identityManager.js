/**
 * Identity Manager — Loads and caches user identity context for Starman.
 *
 * Fetches the user's identity (traits, segments, starmanPersona) from the
 * Knowledge Service and caches it in Redis for the session lifetime.
 *
 * This module ONLY READS user data. All writes happen through the
 * Knowledge Service's answerController when users explicitly answer questions.
 */

const axios = require("axios");
const jwt = require("jsonwebtoken");
const Redis = require("ioredis");
const soul = require("./soul");

// ── Redis Client (reuse sessionStore's connection config) ──
const redis = new Redis(process.env.REDIS_URL || "redis://redis:6379", {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 2000),
});

const KNOWLEDGE_URL =
  process.env.KNOWLEDGE_URL || "http://knowledge:7080/knowledge/api/v1";

const IDENTITY_CACHE_TTL = 30 * 60; // 30 minutes (same as session)
const IDENTITY_PREFIX = "starman:identity:";

// ── Auth ──

function getInternalToken() {
  return jwt.sign(
    { role: "internal", service: "starman" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" },
  );
}

function internalHeaders() {
  return { Authorization: `Bearer ${getInternalToken()}` };
}

// ── Cache Helpers ──

function identityCacheKey(userId) {
  return `${IDENTITY_PREFIX}${userId}`;
}

async function getCachedIdentity(userId) {
  try {
    const raw = await redis.get(identityCacheKey(userId));
    if (!raw) return null;
    // Refresh TTL on access
    await redis.expire(identityCacheKey(userId), IDENTITY_CACHE_TTL);
    return JSON.parse(raw);
  } catch (err) {
    console.error("[IdentityManager] Cache read failed:", err.message);
    return null;
  }
}

async function setCachedIdentity(userId, identity) {
  try {
    await redis.setex(
      identityCacheKey(userId),
      IDENTITY_CACHE_TTL,
      JSON.stringify(identity),
    );
  } catch (err) {
    console.error("[IdentityManager] Cache write failed:", err.message);
  }
}

/**
 * Invalidate cached identity (call after persona updates).
 */
async function invalidateIdentityCache(userId) {
  try {
    await redis.del(identityCacheKey(userId));
  } catch (err) {
    console.error("[IdentityManager] Cache invalidation failed:", err.message);
  }
}

// ── Core API ──

/**
 * Load the full identity context for a user.
 * Returns: { soul, userProfile, starmanPersona }
 *
 * The soul is always the static global soul.
 * userProfile and starmanPersona come from UserKnowledge (Knowledge Service).
 *
 * If the user has no profile yet, returns defaults that gracefully
 * degrade to the current Starman personality.
 */
async function loadIdentityContext(userId, uid) {
  // 1. Check Redis cache first
  const cached = await getCachedIdentity(userId);
  if (cached) {
    return cached;
  }

  // 2. Fetch from Knowledge Service
  let identity = null;
  try {
    const res = await axios.get(
      `${KNOWLEDGE_URL}/user/${userId}/identity-context`,
      { headers: internalHeaders(), timeout: 3000 },
    );
    if (res.data?.found && res.data?.identity) {
      identity = res.data.identity;
    }
  } catch (err) {
    console.error(
      "[IdentityManager] Knowledge Service fetch failed:",
      err.message,
    );
    // Graceful degradation — continue with defaults
  }

  // 3. Build the context object
  const context = {
    soul, // always the static global soul

    userProfile: identity
      ? {
          preferredName: identity.preferredName,
          pronouns: identity.pronouns,
          timezone: identity.timezone,
          role: identity.role,
          traits: identity.traits || [],
          segments: identity.segments || [],
          totalAnswers: identity.totalAnswers || 0,
        }
      : null, // null = no profile yet, use defaults

    starmanPersona: identity?.starmanPersona || null, // null = use default persona
  };

  // 4. Cache it
  await setCachedIdentity(userId, context);

  return context;
}

module.exports = {
  loadIdentityContext,
  invalidateIdentityCache,
  soul,
};
