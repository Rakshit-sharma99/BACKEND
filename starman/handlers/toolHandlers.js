/**
 * Tool handlers – each function calls an existing macbease microservice.
 * These are invoked when Gemini makes a function call.
 *
 * For now these return mock data. Replace the mock responses
 * with real axios calls to your microservices once the endpoints exist.
 */

const axios = require("axios");

// ────────────────────────────────────────────────
// Internal JWT for service-to-service calls
// ────────────────────────────────────────────────
const jwt = require("jsonwebtoken");

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

// ────────────────────────────────────────────────
// Service base URLs (from environment)
// ────────────────────────────────────────────────
const MAP_URL = process.env.MAP_URL || "http://map:5090/map/api/v1";
const EVENT_URL = process.env.EVENT_URL || "http://event:5060/event/api/v1";
const UNIVERSE_URL =
  process.env.UNIVERSE_URL || "http://universe:5050/universe/api/v1";
const MULTIVERSE_URL =
  process.env.MULTIVERSE_URL || "http://multiverse:5070/multiverse/api/v1";
const IPLS_URL = process.env.IPLS_URL || "http://ipls:5080/ipls/api/v1";

// ────────────────────────────────────────────────
// Tool Handlers
// ────────────────────────────────────────────────

/**
 * Search territories on the semantic map by interests.
 */
async function search_territories({ interests }, user) {
  try {
    const res = await axios.get(`${MAP_URL}/searchTerritories`, {
      params: { interests: interests.join(","), uid: user.uid },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_territories error:", err.message);
    return {
      error: true,
      message: "Could not search territories right now.",
    };
  }
}

/**
 * Get upcoming events in the user's universe.
 */
async function get_upcoming_events({ limit = 5 }, user) {
  try {
    const res = await axios.get(`${EVENT_URL}/getUpcomingEvents`, {
      params: { uid: user.uid, limit },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("get_upcoming_events error:", err.message);
    return { error: true, message: "Could not fetch events right now." };
  }
}

/**
 * Search clubs by interests.
 */
async function search_clubs({ interests }, user) {
  try {
    const res = await axios.get(`${UNIVERSE_URL}/club/searchClubs`, {
      params: { query: interests.join(","), uid: user.uid },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_clubs error:", err.message);
    return { error: true, message: "Could not search clubs right now." };
  }
}

/**
 * Get platform stats (active universes, etc).
 */
async function get_platform_stats() {
  try {
    const res = await axios.get(`${MULTIVERSE_URL}/getStats`, {
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("get_platform_stats error:", err.message);
    return { error: true, message: "Could not fetch stats right now." };
  }
}

/**
 * Search users by interests/skills.
 */
async function search_users({ interests, lookingFor }, user) {
  try {
    const res = await axios.get(`${UNIVERSE_URL}/searchUsers`, {
      params: {
        interests: interests.join(","),
        lookingFor: lookingFor || "",
        uid: user.uid,
      },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_users error:", err.message);
    return { error: true, message: "Could not search users right now." };
  }
}

/**
 * Find alumni at a specific company.
 */
async function search_alumni({ company }, user) {
  try {
    const res = await axios.get(`${UNIVERSE_URL}/searchAlumni`, {
      params: { company, uid: user.uid },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("search_alumni error:", err.message);
    return {
      error: true,
      message: "Could not search alumni right now.",
    };
  }
}

/**
 * Compute similarity between two users.
 */
async function compute_similarity({ targetUserId }, user) {
  try {
    const res = await axios.get(`${MAP_URL}/computeSimilarity`, {
      params: { userId1: user.id, userId2: targetUserId },
      headers: internalHeaders(),
    });
    return res.data;
  } catch (err) {
    console.error("compute_similarity error:", err.message);
    return {
      error: true,
      message: "Could not compute similarity right now.",
    };
  }
}

/**
 * Send a DM to users on behalf of the current user.
 */
async function send_message({ recipientIds, message }, user) {
  try {
    const res = await axios.post(
      `${UNIVERSE_URL}/sendBulkMessage`,
      { recipientIds, message, senderId: user.id },
      { headers: internalHeaders() },
    );
    return res.data;
  } catch (err) {
    console.error("send_message error:", err.message);
    return { error: true, message: "Could not send messages right now." };
  }
}

// ────────────────────────────────────────────────
// Registry – maps function name → handler
// ────────────────────────────────────────────────
const TOOL_HANDLERS = {
  search_territories,
  get_upcoming_events,
  search_clubs,
  get_platform_stats,
  search_users,
  search_alumni,
  compute_similarity,
  send_message,
};

/**
 * Execute a tool by name with given args.
 */
async function executeTool(name, args, user) {
  const handler = TOOL_HANDLERS[name];
  if (!handler) {
    return { error: true, message: `Unknown tool: ${name}` };
  }
  return handler(args, user);
}

module.exports = { executeTool, TOOL_HANDLERS };
