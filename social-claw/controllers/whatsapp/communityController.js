/**
 * WhatsApp Community Controller — manage selected communities.
 * All operations scoped to the authenticated user via req.user.id.
 */

const axios = require("axios");
const jwt = require("jsonwebtoken");
const registry = require("../../platforms/whatsapp/tenantRegistry");
const { processMessages } = require("../../platforms/whatsapp/messageHandler");

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
 * GET /whatsapp/communities
 */
const getCommunities = async (req, res) => {
  try {
    const userId = req.user.id;
    const groups = await registry.getTenantGroups(userId);
    const db = registry.getTenantDB(userId);
    const selected = db.getSelectedCommunities();
    const selectedIds = new Set(selected.map((s) => s.id));

    const result = groups.map((g) => ({
      ...g,
      isSelected: selectedIds.has(g.id),
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /whatsapp/communities/selected
 */
const getSelectedCommunities = (req, res) => {
  const userId = req.user.id;
  const db = registry.getTenantDB(userId);
  const contextManager = registry.getTenantContextManager(userId);

  const selected = db.getSelectedCommunities();
  const stats = db.getStats();
  const contextStats = contextManager.getAllContextStats();

  const result = selected.map((c) => {
    const hotStats = stats.communities.find(
      (s) => s.community_id === c.id,
    );
    const warmStats = contextStats.find((s) => s.communityId === c.id);

    return {
      id: c.id,
      name: c.name,
      selectedAt: c.selected_at,
      hotTier: {
        messageCount: hotStats?.count || 0,
        oldest: hotStats?.oldest || null,
        newest: hotStats?.newest || null,
      },
      warmTier: {
        sizeKB: warmStats?.sizeKB || 0,
        entryCount: warmStats?.entryCount || 0,
        lastDistilled: warmStats?.lastDistilled || null,
      },
    };
  });

  res.json(result);
};

/**
 * POST /whatsapp/communities/select
 * Links selected communities to the knowledge service with historical data.
 */
const selectCommunities = async (req, res) => {
  const { communities } = req.body;
  if (!Array.isArray(communities)) {
    return res
      .status(400)
      .json({ error: "communities must be an array of { id, name }" });
  }

  const userId = req.user.id;
  const uid = req.user.uid;
  const db = registry.getTenantDB(userId);

  db.setSelectedCommunities(communities);

  // Buffer historical messages from Baileys into SQLite now that communities are selected
  for (const community of communities) {
    const historical = registry.getTenantHistoricalMessages(userId, community.id, 500);
    if (historical && historical.length > 0) {
      const result = processMessages(historical, db, userId, uid, true);
      console.log(`[CommunityController] Ingested ${result.ingested} historical messages for ${community.name}`);
    }
  }

  // Register each community with the knowledge service (non-blocking)
  for (const community of communities) {
    linkCommunityToKnowledge(userId, uid, community, db).catch((err) =>
      console.error(
        `[CommunityController] Knowledge link failed for ${community.name}:`,
        err.message
      )
    );
  }

  res.json({
    success: true,
    selected: communities.length,
  });
};

/**
 * Register a community with the knowledge service.
 * Sends historical messages for LLM distillation and context initialization.
 */
async function linkCommunityToKnowledge(userId, uid, community, db) {
  if (!uid) {
    console.warn("[CommunityController] No uid available, skipping knowledge link");
    return;
  }

  try {
    // Fetch historical messages from SQLite (up to 500 most recent)
    const historicalMessages = db
      .getMessagesForCommunity(community.id, 500)
      .map((m) => ({
        text: m.text,
        sender: m.sender_name || m.sender || "Unknown",
        timestamp: m.timestamp,
      }))
      .filter((m) => m.text && m.text.trim().length > 0);

    await axios.post(
      `${KNOWLEDGE_URL}/external/link`,
      {
        uid,
        entityId: community.id,
        entityName: community.name,
        platform: "whatsapp",
        userId,
        historicalMessages,
      },
      {
        headers: { Authorization: `Bearer ${getInternalToken()}` },
        timeout: 10000,
      }
    );

    console.log(
      `✅ [CommunityController] Linked "${community.name}" to knowledge service (${historicalMessages.length} historical messages)`
    );
  } catch (err) {
    console.error(
      `[CommunityController] Failed to link "${community.name}" to knowledge:`,
      err.message
    );
  }
}

/**
 * POST /whatsapp/communities/:id/purge
 */
const purgeCommunity = (req, res) => {
  const communityId = decodeURIComponent(req.params.id);
  const userId = req.user.id;
  const db = registry.getTenantDB(userId);
  const contextManager = registry.getTenantContextManager(userId);

  db.purgeCommunity(communityId);
  db.deselectCommunity(communityId);
  contextManager.purgeContext(communityId);

  res.json({ success: true, purged: communityId });
};

module.exports = {
  getCommunities,
  getSelectedCommunities,
  selectCommunities,
  purgeCommunity,
};

