/**
 * Stats Controller — aggregated statistics across platforms.
 * Calls the knowledge service for external context stats.
 */

const axios = require("axios");
const jwt = require("jsonwebtoken");
const registry = require("../platforms/whatsapp/tenantRegistry");

const KNOWLEDGE_URL =
  process.env.KNOWLEDGE_URL || "http://knowledge:7080/knowledge/api/v1";

function getInternalToken() {
  return jwt.sign(
    { role: "internal", service: "social-claw" },
    process.env.ACCESS_TOKEN_SECRET,
    { expiresIn: "5m" }
  );
}

/**
 * GET /stats
 */
const getStats = async (req, res) => {
  const userId = req.user.id;
  const status = registry.getTenantStatus(userId);

  // Fetch knowledge service stats for this user
  let knowledgeStats = { contextFiles: 0, totalHotMessages: 0 };
  try {
    const resp = await axios.get(`${KNOWLEDGE_URL}/external/user-stats`, {
      params: { userId },
      headers: { Authorization: `Bearer ${getInternalToken()}` },
      timeout: 5000,
    });
    knowledgeStats = resp.data;
  } catch (err) {
    console.error(
      "[StatsController] Knowledge service call failed:",
      err.message
    );
  }

  res.json({
    platforms: {
      whatsapp: {
        connection: status,
      },
      telegram: { available: false },
      discord: { available: false },
    },
    knowledge: {
      contextFiles: knowledgeStats.contextFiles,
      totalHotMessages: knowledgeStats.totalHotMessages,
    },
    activeTenants: registry.getActiveTenantCount(),
  });
};

module.exports = { getStats };
