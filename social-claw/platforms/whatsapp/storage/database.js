/**
 * Multi-tenant SQLite Database Factory — creates per-user hot-tier storage.
 *
 * Each user gets their own SQLite database at data/{userId}/uniquery.db
 * with the same schema as the original uniquery-bridge.
 */

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const BASE_DATA_DIR = path.join(__dirname, "../../../../data");

/**
 * Create (or open) a per-user database instance.
 *
 * @param {string} userId - The authenticated user's ID
 * @returns {object} - Database API scoped to this user
 */
function createDatabase(userId) {
  const userDir = path.join(BASE_DATA_DIR, userId);
  const dbPath = path.join(userDir, "uniquery.db");

  // Ensure user data directory exists
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }

  const db = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");

  // ── Schema ──
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      community_id TEXT NOT NULL,
      community_name TEXT,
      sender TEXT,
      sender_name TEXT,
      text TEXT,
      timestamp INTEGER NOT NULL,
      media_metadata TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now'))
    );

    CREATE INDEX IF NOT EXISTS idx_messages_community_ts
      ON messages(community_id, timestamp);

    CREATE INDEX IF NOT EXISTS idx_messages_timestamp
      ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS selected_communities (
      id TEXT PRIMARY KEY,
      name TEXT,
      selected_at INTEGER DEFAULT (strftime('%s','now'))
    );
  `);

  // ── Prepared Statements ──
  const insertMsg = db.prepare(`
    INSERT OR IGNORE INTO messages
      (id, community_id, community_name, sender, sender_name, text, timestamp, media_metadata)
    VALUES
      (@id, @communityId, @communityName, @sender, @senderName, @text, @timestamp, @mediaMetadata)
  `);

  const searchStmt = db.prepare(`
    SELECT id, community_id, community_name, sender, sender_name, text, timestamp, media_metadata
    FROM messages
    WHERE text LIKE @query
    ORDER BY timestamp DESC
    LIMIT @limit
  `);

  const searchByCommunityStmt = db.prepare(`
    SELECT id, community_id, community_name, sender, sender_name, text, timestamp, media_metadata
    FROM messages
    WHERE text LIKE @query AND community_id = @communityId
    ORDER BY timestamp DESC
    LIMIT @limit
  `);

  const getMessagesByCommunity = db.prepare(`
    SELECT * FROM messages
    WHERE community_id = @communityId
    ORDER BY timestamp DESC
    LIMIT @limit
  `);

  const getOldMessages = db.prepare(`
    SELECT * FROM messages
    WHERE timestamp < @cutoff
    ORDER BY community_id, timestamp ASC
  `);

  const deleteOldMessages = db.prepare(`
    DELETE FROM messages WHERE timestamp < @cutoff
  `);

  const deleteByCommunity = db.prepare(`
    DELETE FROM messages WHERE community_id = @communityId
  `);

  const countByCommunity = db.prepare(`
    SELECT community_id, community_name, COUNT(*) as count,
           MIN(timestamp) as oldest, MAX(timestamp) as newest
    FROM messages
    GROUP BY community_id
  `);

  const totalCount = db.prepare(`SELECT COUNT(*) as total FROM messages`);

  // ── Selected Communities ──
  const insertSelected = db.prepare(`
    INSERT OR REPLACE INTO selected_communities (id, name) VALUES (@id, @name)
  `);

  const removeSelected = db.prepare(`
    DELETE FROM selected_communities WHERE id = @id
  `);

  const getSelected = db.prepare(`
    SELECT * FROM selected_communities
  `);

  const isSelected = db.prepare(`
    SELECT 1 FROM selected_communities WHERE id = @id
  `);

  // ── Public API ──
  return {
    insertMessage(msg) {
      return insertMsg.run({
        id: msg.id,
        communityId: msg.communityId,
        communityName: msg.communityName || null,
        sender: msg.sender || null,
        senderName: msg.senderName || null,
        text: msg.text || null,
        timestamp: msg.timestamp,
        mediaMetadata: msg.mediaMetadata
          ? JSON.stringify(msg.mediaMetadata)
          : null,
      });
    },

    searchMessages(query, communityId = null, limit = 20) {
      const likeQuery = `%${query}%`;
      if (communityId) {
        return searchByCommunityStmt.all({
          query: likeQuery,
          communityId,
          limit,
        });
      }
      return searchStmt.all({ query: likeQuery, limit });
    },

    getMessagesForCommunity(communityId, limit = 50) {
      return getMessagesByCommunity.all({ communityId, limit });
    },

    getMessagesOlderThan(cutoffTimestamp) {
      return getOldMessages.all({ cutoff: cutoffTimestamp });
    },

    pruneOldMessages(retentionDays = 7) {
      const cutoff = Math.floor(Date.now() / 1000) - retentionDays * 86400;
      const result = deleteOldMessages.run({ cutoff });
      return result.changes;
    },

    purgeCommunity(communityId) {
      return deleteByCommunity.run({ communityId });
    },

    getStats() {
      const communities = countByCommunity.all();
      const { total } = totalCount.get();
      return { total, communities };
    },

    selectCommunity(id, name) {
      return insertSelected.run({ id, name });
    },

    deselectCommunity(id) {
      return removeSelected.run({ id });
    },

    getSelectedCommunities() {
      return getSelected.all();
    },

    isCommunitySelected(id) {
      return !!isSelected.get({ id });
    },

    setSelectedCommunities(communities) {
      const clearAll = db.prepare("DELETE FROM selected_communities");
      const insertAll = db.transaction((list) => {
        clearAll.run();
        for (const c of list) {
          insertSelected.run({ id: c.id, name: c.name });
        }
      });
      insertAll(communities);
    },

    close() {
      db.close();
    },

    db,
  };
}

module.exports = { createDatabase };
