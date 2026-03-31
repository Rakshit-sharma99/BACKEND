/**
 * Search Controller — unified cross-platform search.
 * Currently delegates to WhatsApp search; extensible to Telegram/Discord.
 */

const registry = require("../platforms/whatsapp/tenantRegistry");
const { search } = require("../platforms/whatsapp/search");

/**
 * POST /search
 * Body: { query, communityFilter?, limit? }
 */
const searchMessages = (req, res) => {
  const { query, communityFilter, limit } = req.body;

  if (!query || !query.trim()) {
    return res.status(400).json({ error: "query is required" });
  }

  const userId = req.user.id;
  const db = registry.getTenantDB(userId);
  const contextManager = registry.getTenantContextManager(userId);

  const result = search(query, db, contextManager, communityFilter || null, limit || 15);

  // Tag results with platform
  result.results = result.results.map((r) => ({
    ...r,
    platform: "whatsapp",
  }));

  res.json(result);
};

module.exports = { searchMessages };
