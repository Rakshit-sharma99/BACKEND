/**
 * WhatsApp Channel Controller — manage selected channels (newsletters).
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
 * GET /whatsapp/channels
 * Lists channels. Filters by ?q= query and caps at 50 to prevent huge payloads,
 * but ALWAYS includes selected channels so the frontend can retrieve their names.
 */
const getChannels = async (req, res) => {
  try {
    const userId = req.user.id;
    const query = req.query.q?.toLowerCase() || "";
    
    const channels = await registry.getTenantChannels(userId);
    const db = registry.getTenantDB(userId);
    const selected = db.getSelectedChannels();
    const selectedIds = new Set(selected.map((s) => s.id));

    const selectedChannels = [];
    const unselectedChannels = [];

    for (const c of channels) {
      if (selectedIds.has(c.id)) {
        selectedChannels.push({ ...c, isSelected: true });
      } else {
        unselectedChannels.push({ ...c, isSelected: false });
      }
    }

    let filteredUnselected = unselectedChannels;
    if (query) {
      filteredUnselected = unselectedChannels.filter((c) =>
        c.name?.toLowerCase().includes(query)
      );
    }

    // Cap unselected results to avoid huge payloads
    filteredUnselected = filteredUnselected.slice(0, 50);

    // Combine and return
    res.json([...selectedChannels, ...filteredUnselected]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * GET /whatsapp/channels/selected
 * Lists selected channels with hot/warm tier stats.
 */
const getSelectedChannels = (req, res) => {
  const userId = req.user.id;
  const db = registry.getTenantDB(userId);
  const contextManager = registry.getTenantContextManager(userId);

  const selected = db.getSelectedChannels();
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
 * POST /whatsapp/channels/select
 * Links selected channels to the knowledge service with historical data.
 */
const selectChannels = async (req, res) => {
  const { channels } = req.body;
  if (!Array.isArray(channels)) {
    return res
      .status(400)
      .json({ error: "channels must be an array of { id, name }" });
  }

  const userId = req.user.id;
  const uid = req.user.uid;
  const db = registry.getTenantDB(userId);

  db.setSelectedChannels(channels);

  // Buffer historical messages from Baileys into SQLite now that channels are selected
  for (const channel of channels) {
    const historical = registry.getTenantHistoricalMessages(userId, channel.id, 500);
    if (historical && historical.length > 0) {
      const result = processMessages(historical, db, userId, uid, true);
      console.log(`[ChannelController] Ingested ${result.ingested} historical messages for ${channel.name}`);
    }
  }

  // Register each channel with the knowledge service (non-blocking)
  for (const channel of channels) {
    linkChannelToKnowledge(userId, uid, channel, db).catch((err) =>
      console.error(
        `[ChannelController] Knowledge link failed for ${channel.name}:`,
        err.message
      )
    );
  }

  res.json({
    success: true,
    selected: channels.length,
  });
};

/**
 * Register a channel with the knowledge service.
 */
async function linkChannelToKnowledge(userId, uid, channel, db) {
  if (!uid) {
    console.warn("[ChannelController] No uid available, skipping knowledge link");
    return;
  }

  try {
    const historicalMessages = db
      .getMessagesForCommunity(channel.id, 500)
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
        entityId: channel.id,
        entityName: channel.name,
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
      `✅ [ChannelController] Linked "${channel.name}" to knowledge service (${historicalMessages.length} historical messages)`
    );
  } catch (err) {
    console.error(
      `[ChannelController] Failed to link "${channel.name}" to knowledge:`,
      err.message
    );
  }
}

/**
 * POST /whatsapp/channels/:id/purge
 */
const purgeChannel = (req, res) => {
  const channelId = decodeURIComponent(req.params.id);
  const userId = req.user.id;
  const db = registry.getTenantDB(userId);
  const contextManager = registry.getTenantContextManager(userId);

  db.purgeChannel(channelId);
  contextManager.purgeContext(channelId);

  res.json({ success: true, purged: channelId });
};

module.exports = {
  getChannels,
  getSelectedChannels,
  selectChannels,
  purgeChannel,
};
