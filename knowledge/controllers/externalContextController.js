/**
 * External Context Controller — manages lifecycle of external network knowledge.
 *
 * Endpoints:
 *   POST /external/link    — Register + initialize an entity
 *   POST /external/ingest  — Ingest new messages into existing entity
 *   GET  /external/search  — Search across all entities for a university
 *   GET  /external/status  — Sync status of all linked entities
 */

const ExternalContext = require("../models/externalContext");
const { distillMessages, batchDistill } = require("./distillationHelper");

// ── POST /external/link ──

/**
 * Register an external entity (WhatsApp community, Discord server, etc.)
 * and initialize its knowledge base from historical messages.
 *
 * Body: { uid, entityId, entityName, platform, userId, historicalMessages[] }
 * Each historicalMessage: { text, sender, timestamp }
 */
const linkEntity = async (req, res) => {
  try {
    const { uid, entityId, entityName, platform, userId, historicalMessages } =
      req.body;

    if (!uid || !entityId || !entityName || !platform || !userId) {
      return res.status(400).json({
        error: "uid, entityId, entityName, platform, and userId are required",
      });
    }

    // Check if entity already exists for this university
    let entity = await ExternalContext.findOne({ uid, entityId });

    if (entity) {
      // Entity already exists — add user as linker if not already
      if (!entity.linkedBy.includes(userId)) {
        entity.linkedBy.push(userId);
        await entity.save();
      }
      return res.status(200).json({
        success: true,
        status: entity.status,
        entityId: entity.entityId,
        message: "Entity already linked. User added as contributor.",
        isNew: false,
      });
    }

    // Create new entity
    entity = await ExternalContext.create({
      uid,
      entityId,
      entityName,
      platform,
      linkedBy: [userId],
      status: "initializing",
      hotContext: { entries: [], maxEntries: 500 },
      longTermContext: {
        deadlines: [],
        announcements: [],
        resources: [],
        decisions: [],
        summaries: [],
      },
    });

    // Respond immediately so the frontend can show "initializing"
    res.status(201).json({
      success: true,
      status: "initializing",
      entityId: entity.entityId,
      message: "Entity registered. Initialization in progress.",
      isNew: true,
    });

    // ── Background: Initialize from historical messages ──
    initializeEntity(entity, historicalMessages || [], userId).catch((err) =>
      console.error(
        `[ExternalContext] Background init failed for ${entityId}:`,
        err.message,
      ),
    );
  } catch (err) {
    if (err.code === 11000) {
      // Race condition — entity was created between our check and create
      return res
        .status(409)
        .json({ error: "Entity is already being initialized." });
    }
    console.error("[ExternalContext] linkEntity error:", err);
    return res.status(500).json({ error: "Could not link entity." });
  }
};

/**
 * Background initialization: process historical messages and populate context.
 */
async function initializeEntity(entity, historicalMessages, userId) {
  try {
    console.log(
      `🔄 [ExternalContext] Initializing "${entity.entityName}" with ${historicalMessages.length} historical messages`,
    );

    // Populate hot context with recent raw messages
    const hotEntries = historicalMessages
      .slice(-entity.hotContext.maxEntries)
      .map((m) => ({
        text: m.text,
        sender: m.sender || "Unknown",
        timestamp: m.timestamp,
        category: "general",
        contributorId: userId,
      }));

    entity.hotContext.entries = hotEntries;

    // Distill historical messages into long-term knowledge
    if (historicalMessages.length > 0) {
      // Filter to text messages only
      const textMessages = historicalMessages.filter(
        (m) => m.text && m.text.trim().length > 0,
      );

      if (textMessages.length > 0) {
        const distilled = await batchDistill(
          textMessages,
          entity.entityName,
          100,
        );

        // Assign contributorId and timestamps
        const now = new Date();
        for (const category of Object.keys(distilled)) {
          if (Array.isArray(distilled[category])) {
            entity.longTermContext[category] = distilled[category].map(
              (entry) => ({
                text: entry.text,
                date: entry.date || null,
                url: entry.url || null,
                source: entity.entityName,
                addedAt: now,
                contributorId: userId,
              }),
            );
          }
        }
      }
    }

    // Mark as synced
    entity.status = "synced";
    entity.lastSyncedAt = new Date();
    entity.messagesCursor =
      historicalMessages.length > 0
        ? historicalMessages[historicalMessages.length - 1].timestamp
        : 0;

    await entity.save();
    console.log(
      `✅ [ExternalContext] "${entity.entityName}" initialized and synced`,
    );
  } catch (err) {
    console.error(
      `[ExternalContext] Init error for "${entity.entityName}":`,
      err.message,
    );
    entity.status = "error";
    await entity.save().catch(() => {});
  }
}

// ── POST /external/ingest ──

/**
 * Ingest new messages into an existing entity.
 * Updates hot context and periodically triggers re-distillation.
 *
 * Body: { uid, entityId, userId, messages[] }
 */
const ingestMessages = async (req, res) => {
  try {
    const { uid, entityId, userId, messages } = req.body;

    if (!uid || !entityId || !messages || !Array.isArray(messages)) {
      return res
        .status(400)
        .json({ error: "uid, entityId, and messages[] are required" });
    }

    const entity = await ExternalContext.findOne({ uid, entityId });
    if (!entity) {
      return res.status(404).json({ error: "Entity not found." });
    }

    // Append to hot context
    const newEntries = messages
      .filter((m) => m.text && m.text.trim().length > 0)
      .map((m) => ({
        text: m.text,
        sender: m.sender || "Unknown",
        timestamp: m.timestamp,
        category: "general",
        contributorId: userId || null,
      }));

    entity.hotContext.entries.push(...newEntries);

    // Enforce cap — drop oldest entries
    const maxEntries = entity.hotContext.maxEntries || 500;
    if (entity.hotContext.entries.length > maxEntries) {
      entity.hotContext.entries = entity.hotContext.entries.slice(-maxEntries);
    }

    // Update cursor
    if (messages.length > 0) {
      const newestTimestamp = Math.max(
        ...messages.map((m) => m.timestamp || 0),
      );
      if (newestTimestamp > entity.messagesCursor) {
        entity.messagesCursor = newestTimestamp;
      }
    }

    entity.lastSyncedAt = new Date();
    await entity.save();

    // Trigger distillation in background if enough new messages
    if (newEntries.length >= 10) {
      distillAndMerge(entity, newEntries, userId).catch((err) =>
        console.error(
          `[ExternalContext] Background distillation failed for ${entityId}:`,
          err.message,
        ),
      );
    }

    return res.status(200).json({
      success: true,
      ingested: newEntries.length,
      hotContextSize: entity.hotContext.entries.length,
    });
  } catch (err) {
    console.error("[ExternalContext] ingestMessages error:", err);
    return res.status(500).json({ error: "Could not ingest messages." });
  }
};

/**
 * Background: distill new messages and merge into long-term context.
 */
async function distillAndMerge(entity, newEntries, userId) {
  const distilled = await distillMessages(newEntries, entity.entityName);
  const now = new Date();

  for (const category of Object.keys(distilled)) {
    if (
      Array.isArray(distilled[category]) &&
      distilled[category].length > 0 &&
      Array.isArray(entity.longTermContext[category])
    ) {
      const formatted = distilled[category].map((entry) => ({
        text: entry.text,
        date: entry.date || null,
        url: entry.url || null,
        source: entity.entityName,
        addedAt: now,
        contributorId: userId || null,
      }));
      entity.longTermContext[category].push(...formatted);
    }
  }

  await entity.save();
  console.log(
    `🧠 [ExternalContext] Distilled ${newEntries.length} messages into long-term context for "${entity.entityName}"`,
  );
}

// ── GET /external/search ──

/**
 * Search across all entities for a university.
 * Supports optional filters: platform, entityFilter, contributorId (for user-scoped queries).
 *
 * Query: { query, uid, platform?, entityFilter?, contributorId? }
 */
const searchContext = async (req, res) => {
  try {
    const { query, uid, platform, entityFilter, contributorId } = req.query;

    if (!query || !uid) {
      return res.status(400).json({ error: "query and uid are required" });
    }

    // Find all entities for this university
    const filter = { uid, status: "synced" };
    if (platform) filter.platform = platform;
    if (entityFilter) {
      filter.$or = [
        { entityName: { $regex: entityFilter, $options: "i" } },
        { entityId: entityFilter },
      ];
    }

    const entities = await ExternalContext.find(filter).lean();

    if (entities.length === 0) {
      return res.status(200).json({
        found: false,
        message: "No linked external networks found for this university.",
        results: [],
      });
    }

    const queryLower = query.toLowerCase();
    const results = [];

    for (const entity of entities) {
      // Search hot context
      const hotEntries = (entity.hotContext?.entries || []).filter((e) => {
        if (
          contributorId &&
          String(e.contributorId) !== String(contributorId)
        ) {
          return false;
        }
        return e.text && e.text.toLowerCase().includes(queryLower);
      });

      for (const entry of hotEntries.slice(-20)) {
        results.push({
          text: entry.text,
          sender: entry.sender,
          timestamp: entry.timestamp,
          entityName: entity.entityName,
          platform: entity.platform,
          tier: "hot",
          category: entry.category,
        });
      }

      // Search long-term context
      for (const [category, entries] of Object.entries(
        entity.longTermContext || {},
      )) {
        if (!Array.isArray(entries)) continue;

        const matched = entries.filter((e) => {
          if (
            contributorId &&
            String(e.contributorId) !== String(contributorId)
          ) {
            return false;
          }
          return e.text && e.text.toLowerCase().includes(queryLower);
        });

        for (const entry of matched.slice(-10)) {
          results.push({
            text: entry.text,
            date: entry.date || null,
            url: entry.url || null,
            entityName: entity.entityName,
            platform: entity.platform,
            tier: "long-term",
            category,
            addedAt: entry.addedAt,
          });
        }
      }
    }

    // Sort results: long-term first (more curated), then hot by timestamp
    results.sort((a, b) => {
      if (a.tier !== b.tier) return a.tier === "long-term" ? -1 : 1;
      return (b.timestamp || 0) - (a.timestamp || 0);
    });

    return res.status(200).json({
      found: results.length > 0,
      resultCount: results.length,
      results: results.slice(0, 30),
    });
  } catch (err) {
    console.error("[ExternalContext] searchContext error:", err);
    return res
      .status(500)
      .json({ error: "Could not search external context." });
  }
};

// ── GET /external/status ──

/**
 * Get sync status of all linked entities for a university.
 *
 * Query: { uid, userId? }
 * If userId is provided, only returns entities the user has linked.
 */
const getStatus = async (req, res) => {
  try {
    const { uid, userId } = req.query;

    if (!uid) {
      return res.status(400).json({ error: "uid is required" });
    }

    const filter = { uid };
    if (userId) {
      filter.linkedBy = userId;
    }

    const entities = await ExternalContext.find(filter)
      .select(
        "entityId entityName platform status lastSyncedAt linkedBy hotContext.entries longTermContext",
      )
      .lean();

    const statuses = entities.map((e) => {
      // Count long-term entries across all categories
      let longTermEntryCount = 0;
      if (e.longTermContext) {
        for (const entries of Object.values(e.longTermContext)) {
          if (Array.isArray(entries)) longTermEntryCount += entries.length;
        }
      }

      return {
        entityId: e.entityId,
        entityName: e.entityName,
        platform: e.platform,
        status: e.status,
        lastSyncedAt: e.lastSyncedAt,
        linkerCount: e.linkedBy?.length || 0,
        hotEntryCount: e.hotContext?.entries?.length || 0,
        longTermEntryCount,
      };
    });

    return res.status(200).json({ entities: statuses });
  } catch (err) {
    console.error("[ExternalContext] getStatus error:", err);
    return res.status(500).json({ error: "Could not get status." });
  }
};

// ── GET /external/user-stats ──

/**
 * Get aggregated stats for a user's external context contributions.
 * Returns number of context files the user has contributed to and
 * cumulative hot context message count across all those files.
 *
 * Query: { userId }
 */
const getUserStats = async (req, res) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const entities = await ExternalContext.find({ linkedBy: userId })
      .select("entityId entityName platform status hotContext.entries")
      .lean();

    let totalHotMessages = 0;
    for (const entity of entities) {
      totalHotMessages += entity.hotContext?.entries?.length || 0;
    }

    return res.status(200).json({
      contextFiles: entities.length,
      totalHotMessages,
    });
  } catch (err) {
    console.error("[ExternalContext] getUserStats error:", err);
    return res.status(500).json({ error: "Could not get user stats." });
  }
};

// ── GET /external/user-contexts ──

/**
 * Get all external contexts linked to a user.
 * Returns cards data containing entityName, platform, status, lastSyncedAt, etc.
 *
 * Query: { userId }
 */
const getUserContexts = async (req, res) => {
  try {
    const { userId } = req.query;

    const targetUser = userId || req.user.id;

    if (!targetUser) {
      return res.status(400).json({ error: "userId is required" });
    }

    const entities = await ExternalContext.find({ linkedBy: targetUser })
      .select(
        "entityId entityName platform status lastSyncedAt hotContext.entries longTermContext",
      )
      .lean();

    const contexts = entities.map((e) => {
      let longTermEntryCount = 0;
      if (e.longTermContext) {
        for (const entries of Object.values(e.longTermContext)) {
          if (Array.isArray(entries)) longTermEntryCount += entries.length;
        }
      }

      return {
        id: e._id || e.entityId,
        entityId: e.entityId,
        entityName: e.entityName,
        platform: e.platform,
        status: e.status,
        lastSyncedAt: e.lastSyncedAt,
        hotEntryCount: e.hotContext?.entries?.length || 0,
        longTermEntryCount,
        totalEntries: (e.hotContext?.entries?.length || 0) + longTermEntryCount,
      };
    });

    // Sort by most recently synced
    contexts.sort((a, b) => {
      const timeA = a.lastSyncedAt ? new Date(a.lastSyncedAt).getTime() : 0;
      const timeB = b.lastSyncedAt ? new Date(b.lastSyncedAt).getTime() : 0;
      return timeB - timeA;
    });

    return res.status(200).json({ contexts });
  } catch (err) {
    console.error("[ExternalContext] getUserContexts error:", err);
    return res.status(500).json({ error: "Could not get user contexts." });
  }
};

// ── GET /external/user-contexts/:id/entries ──

/**
 * Get raw entries (hot and long-term) for a specific external context.
 *
 * Params: { id }
 * Query: { userId }
 */
const getContextEntries = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    const targetUser = userId || req.user?.id;

    if (!id || !targetUser) {
      return res.status(400).json({ error: "id and userId are required" });
    }

    const contextDoc = await ExternalContext.findOne({
      _id: id,
      linkedBy: targetUser,
    })
      .select("entityName platform hotContext.entries longTermContext")
      .lean();

    if (!contextDoc) {
      return res.status(404).json({ error: "Context not found or access denied" });
    }

    const hotEntries = contextDoc.hotContext?.entries || [];
    
    // Flatten longTermContext categories into an array
    const longTermEntries = [];
    if (contextDoc.longTermContext) {
      for (const [category, entries] of Object.entries(contextDoc.longTermContext)) {
        if (Array.isArray(entries)) {
          entries.forEach((entry) => {
            longTermEntries.push({ ...entry, _category: category });
          });
        }
      }
    }

    // Sort hot by timestamp descending
    hotEntries.sort((a, b) => b.timestamp - a.timestamp);
    // Sort long term by addedAt descending
    longTermEntries.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

    return res.status(200).json({
      entityName: contextDoc.entityName,
      platform: contextDoc.platform,
      hotEntries,
      longTermEntries,
    });
  } catch (err) {
    console.error("[ExternalContext] getContextEntries error:", err);
    return res.status(500).json({ error: "Could not get context entries." });
  }
};

// ── DELETE /external/user-contexts/:id ──

/**
 * Delete a user's access to an external context.
 * If the user is the only one who linked it, the context is permanently deleted.
 * If others use it, the user is just removed from the linkedBy array.
 *
 * Params: { id }
 * Query: { userId }
 */
const deleteContext = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    const targetUser = userId || req.user?.id;

    if (!id || !targetUser) {
      return res.status(400).json({ error: "id and userId are required" });
    }

    const contextDoc = await ExternalContext.findOne({
      _id: id,
      linkedBy: targetUser,
    });

    if (!contextDoc) {
      return res.status(404).json({ error: "Context not found or access denied" });
    }

    // Remove user from linkedBy
    contextDoc.linkedBy = contextDoc.linkedBy.filter(
      (uid) => String(uid) !== String(targetUser)
    );

    if (contextDoc.linkedBy.length === 0) {
      // If nobody else is linking this, delete the document entirely
      await ExternalContext.deleteOne({ _id: id });
      return res.status(200).json({ success: true, message: "Context permanently deleted" });
    } else {
      // Otherwise, just remove the user's link
      await contextDoc.save();
      return res.status(200).json({ success: true, message: "Context unlinked for user" });
    }
  } catch (err) {
    console.error("[ExternalContext] deleteContext error:", err);
    return res.status(500).json({ error: "Could not delete context." });
  }
};

module.exports = {
  linkEntity,
  ingestMessages,
  searchContext,
  getStatus,
  getUserStats,
  getUserContexts,
  getContextEntries,
  deleteContext,
};
