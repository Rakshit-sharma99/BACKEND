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
 * Lists communities. Filters by ?q= query and caps at 50 to prevent huge payloads,
 * but ALWAYS includes selected communities so the frontend can retrieve their names.
 */
const getCommunities = async (req, res) => {
  try {
    const userId = req.user.id;
    const query = req.query.q?.toLowerCase() || "";
    
    const groups = await registry.getTenantGroups(userId);
    const db = registry.getTenantDB(userId);
    const selected = db.getSelectedCommunities();
    const selectedIds = new Set(selected.map((s) => s.id));

    const selectedGroups = [];
    const unselectedGroups = [];

    for (const g of groups) {
      if (selectedIds.has(g.id)) {
        selectedGroups.push({ ...g, isSelected: true });
      } else {
        unselectedGroups.push({ ...g, isSelected: false });
      }
    }

    let filteredUnselected = unselectedGroups;
    if (query) {
      filteredUnselected = unselectedGroups.filter((g) =>
        g.name?.toLowerCase().includes(query)
      );
    }

    // Cap unselected results to avoid huge payloads
    filteredUnselected = filteredUnselected.slice(0, 50);

    // Combine and return
    res.json([...selectedGroups, ...filteredUnselected]);
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
 *
 * Responds immediately to the user, then waits for Baileys history sync
 * to complete in the background before creating context files.
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

  // Respond immediately — don't make the user wait for history sync
  res.json({
    success: true,
    selected: communities.length,
    message: "Communities saved. Context files will be created once history sync completes.",
  });

  // ── Background: wait for history sync, then create context ──
  (async () => {
    try {
      console.log(`⏳ [CommunityController] Waiting for history sync to complete before linking ${communities.length} communities...`);
      await registry.waitForTenantHistorySync(userId);
      console.log(`✅ [CommunityController] History sync complete. Draining cache and linking communities...`);

      // Drain full history cache into SQLite for each selected community
      for (const community of communities) {
        const historical = registry.getTenantHistoricalMessages(userId, community.id, 3000);
        if (historical && historical.length > 0) {
          const result = processMessages(historical, db, userId, uid, true);
          console.log(`📥 [CommunityController] Ingested ${result.ingested} historical messages for ${community.name}`);
        }
      }

      // Register each community with the knowledge service
      for (const community of communities) {
        try {
          await linkCommunityToKnowledge(userId, uid, community, db);
        } catch (err) {
          console.error(
            `[CommunityController] Knowledge link failed for ${community.name}:`,
            err.message
          );
        }
      }

      console.log(`✅ [CommunityController] All ${communities.length} communities linked after full history sync.`);
    } catch (err) {
      console.error(`[CommunityController] Background link failed:`, err.message);
    }
  })();
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
    // Fetch historical messages from SQLite (up to 2000 most recent for 7-day coverage)
    const historicalMessages = db
      .getMessagesForCommunity(community.id, 2000)
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

/**
 * POST /whatsapp/communities/:id/deep-sync
 * Triggers a deep historical sync for a community (15 or 30 days).
 * 
 * Pipeline:
 *   1. Drain Baileys in-memory history cache → SQLite (picks up messages missed in initial 500 batch)
 *   2. Fetch all messages from SQLite for the requested timestamp range
 *   3. Forward them to the knowledge service for hot-tier merge + re-distillation
 */
const deepSyncCommunity = async (req, res) => {
  const communityId = decodeURIComponent(req.params.id);
  const { syncDepthDays } = req.body;
  const userId = req.user.id;
  const uid = req.user.uid;

  if (!syncDepthDays || ![15, 30].includes(syncDepthDays)) {
    return res.status(400).json({ error: "syncDepthDays must be 15 or 30" });
  }

  if (!uid) {
    return res.status(400).json({ error: "uid is required for knowledge sync" });
  }

  const db = registry.getTenantDB(userId);

  // ── Step 1: Force fresh history sync via reconnect ──
  // Clears Baileys' "already synced" markers, reconnects to re-trigger
  // full history delivery from the phone (no QR re-scan needed)
  console.log(`🔄 [CommunityController] Deep sync: requesting history resync for ${communityId}...`);
  const newMsgsFromResync = await registry.requestTenantHistoryResync(userId, communityId);
  console.log(`📊 [CommunityController] History resync delivered ${newMsgsFromResync} new messages for ${communityId}`);

  // Drain all cached messages into SQLite
  const cachedMessages = registry.getTenantHistoricalMessages(userId, communityId, 5000);
  if (cachedMessages && cachedMessages.length > 0) {
    const result = processMessages(cachedMessages, db, userId, uid, true);
    console.log(
      `📥 [CommunityController] Deep sync: ingested ${result.ingested} new messages for ${communityId} (${result.dropped} dropped/dupes)`,
    );
  }

  // ── Step 2: Fetch from SQLite for the requested range ──
  const cutoffTimestamp = Math.floor(Date.now() / 1000) - syncDepthDays * 86400;

  const rawMessages = db.getMessagesForCommunityInRange(
    communityId,
    cutoffTimestamp,
    5000,
  );

  const historicalMessages = rawMessages
    .map((m) => ({
      text: m.text,
      sender: m.sender_name || m.sender || "Unknown",
      timestamp: m.timestamp,
    }))
    .filter((m) => m.text && m.text.trim().length > 0);

  console.log(
    `🔄 [CommunityController] Deep sync for "${communityId}": ${historicalMessages.length} messages (${syncDepthDays} days)`,
  );

  if (historicalMessages.length === 0) {
    return res.json({
      success: true,
      syncDepthDays,
      messagesSent: 0,
      message: "No historical messages available for the requested range.",
    });
  }

  // ── Step 3: Forward to knowledge service ──
  try {
    await axios.post(
      `${KNOWLEDGE_URL}/external/deep-sync`,
      {
        uid,
        entityId: communityId,
        userId,
        syncDepthDays,
        historicalMessages,
      },
      {
        headers: { Authorization: `Bearer ${getInternalToken()}` },
        timeout: 30000,
      },
    );

    res.json({
      success: true,
      syncDepthDays,
      messagesSent: historicalMessages.length,
    });
  } catch (err) {
    console.error(
      `[CommunityController] Deep sync failed for "${communityId}":`,
      err.message,
    );
    res.status(500).json({ error: "Deep sync failed: " + err.message });
  }
};

module.exports = {
  getCommunities,
  getSelectedCommunities,
  selectCommunities,
  purgeCommunity,
  deepSyncCommunity,
};
