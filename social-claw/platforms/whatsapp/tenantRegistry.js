/**
 * Tenant Registry — manages per-user WhatsApp session lifecycle.
 *
 * Maintains a Map<userId, TenantContext> where each TenantContext holds:
 *   - A Baileys session (sessionManager)
 *   - A database instance (SQLite)
 *   - A context file manager (warm tier)
 *   - Last activity timestamp (for idle cleanup)
 *
 * Idle sessions are cleaned up after IDLE_TIMEOUT_MS to conserve memory.
 */

const fs = require("fs");
const path = require("path");
const { createSession } = require("./sessionManager");
const { createDatabase } = require("./storage/database");
const { createContextManager } = require("./storage/contextFileManager");
const { processMessages } = require("./messageHandler");

const BASE_AUTH_DIR = path.join(__dirname, "../../auth_info");
const BASE_DATA_DIR = path.join(__dirname, "../../data");

const IDLE_TIMEOUT_MS = parseInt(
  process.env.IDLE_TIMEOUT_MS || "1800000",
  10,
); // 30 min default

/** @type {Map<string, object>} */
const tenants = new Map();

let cleanupInterval = null;

/**
 * Get or create a tenant context for a user.
 * Touching a tenant resets its idle timer.
 *
 * @param {string} userId
 * @returns {object} - { session, db, contextManager }
 */
function getTenant(userId) {
  if (tenants.has(userId)) {
    const tenant = tenants.get(userId);
    tenant.lastActivity = Date.now();
    return tenant;
  }

  console.log(`🆕 [TenantRegistry] Creating tenant for user: ${userId}`);

  const db = createDatabase(userId);
  const contextManager = createContextManager(userId);

  const tenant = {
    userId,
    session: null, // lazy — created on connect()
    db,
    contextManager,
    lastActivity: Date.now(),
    connected: false,
  };

  tenants.set(userId, tenant);

  // Start cleanup timer if not already running
  if (!cleanupInterval) {
    cleanupInterval = setInterval(cleanupIdleTenants, 60000); // Check every minute
  }

  return tenant;
}

/**
 * Connect a user's WhatsApp session (starts Baileys).
 * @param {string} userId
 * @param {string} uid - The user's universe ID (for knowledge service integration)
 */
async function connectTenant(userId, uid) {
  const tenant = getTenant(userId);

  // Store uid for later use in message forwarding, and persist it
  if (uid) {
    tenant.uid = uid;
    try { tenant.db.setMeta("uid", uid); } catch (_) {}
  }

  if (tenant.connected && tenant.session) {
    const status = tenant.session.getStatus();
    if (status.state === "open" || status.state === "qr") {
      return status;
    }
  }

  // Create a new session with a message callback that uses this tenant's DB
  const session = await createSession(userId, (rawMessages) => {
    const result = processMessages(rawMessages, tenant.db, userId, tenant.uid);
    if (result.ingested > 0) {
      console.log(
        `📨 [${userId}] Ingested ${result.ingested} messages (dropped ${result.dropped})`,
      );
    }
  });

  tenant.session = session;
  tenant.connected = true;
  tenant.lastActivity = Date.now();

  // Start the connection
  await session.connect();

  // Schedule periodic message pruning for this tenant
  const retentionDays = parseInt(
    process.env.MESSAGE_RETENTION_DAYS || "7",
    10,
  );
  tenant.pruneInterval = setInterval(() => {
    const pruned = tenant.db.pruneOldMessages(retentionDays);
    if (pruned > 0) {
      console.log(
        `🧹 [${userId}] Pruned ${pruned} messages older than ${retentionDays} days`,
      );
    }
  }, 6 * 60 * 60 * 1000); // Every 6 hours

  return session.getStatus();
}

/**
 * Disconnect a user's WhatsApp session.
 */
async function disconnectTenant(userId) {
  if (!tenants.has(userId)) return;

  const tenant = tenants.get(userId);

  if (tenant.session) {
    await tenant.session.logout();
  }

  tenant.connected = false;
}

/**
 * Get a user's connection status.
 */
function getTenantStatus(userId) {
  const tenant = tenants.has(userId) ? tenants.get(userId) : null;

  if (!tenant || !tenant.session) {
    return { state: "disconnected", phone: null };
  }

  tenant.lastActivity = Date.now();
  return tenant.session.getStatus();
}

/**
 * Get QR code for a user's session.
 */
function getTenantQR(userId) {
  const tenant = tenants.has(userId) ? tenants.get(userId) : null;

  if (!tenant || !tenant.session) {
    return null;
  }

  tenant.lastActivity = Date.now();
  return tenant.session.getQR();
}

/**
 * Get WhatsApp groups for a user's session.
 */
async function getTenantGroups(userId) {
  const tenant = tenants.has(userId) ? tenants.get(userId) : null;

  if (!tenant || !tenant.session) {
    return [];
  }

  tenant.lastActivity = Date.now();
  return tenant.session.getGroups();
}

/**
 * Get WhatsApp channels (newsletters) for a user's session.
 */
async function getTenantChannels(userId) {
  const tenant = tenants.has(userId) ? tenants.get(userId) : null;

  if (!tenant || !tenant.session) {
    return [];
  }

  tenant.lastActivity = Date.now();
  return await tenant.session.getChannels();
}

/**
 * Get the database instance for a user.
 */
function getTenantDB(userId) {
  return getTenant(userId).db;
}

/**
 * Get the context manager for a user.
 */
function getTenantContextManager(userId) {
  return getTenant(userId).contextManager;
}

/**
 * Cleanup idle tenant sessions to conserve memory.
 */
function cleanupIdleTenants() {
  const now = Date.now();

  for (const [userId, tenant] of tenants.entries()) {
    const idle = now - tenant.lastActivity;

    if (idle > IDLE_TIMEOUT_MS && tenant.connected) {
      console.log(
        `🕐 [TenantRegistry] Cleaning up idle tenant: ${userId} (idle ${Math.round(idle / 60000)} min)`,
      );

      // Destroy Baileys session
      if (tenant.session) {
        tenant.session.destroy();
      }

      // Clear prune interval
      if (tenant.pruneInterval) {
        clearInterval(tenant.pruneInterval);
      }

      // Close database
      if (tenant.db) {
        try {
          tenant.db.close();
        } catch (_) {}
      }

      tenants.delete(userId);
    }
  }

  // Stop cleanup interval if no tenants remain
  if (tenants.size === 0 && cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}

/**
 * Get total active tenant count (for stats).
 */
function getActiveTenantCount() {
  return tenants.size;
}

/**
 * Get cached historical messages for a user's specific community.
 */
function getTenantHistoricalMessages(userId, communityId, limit = 500) {
  const tenant = tenants.has(userId) ? tenants.get(userId) : null;
  if (!tenant || !tenant.session) return [];
  
  tenant.lastActivity = Date.now();
  return tenant.session.getHistoricalMessages(communityId, limit);
}

/**
 * Restore all previously-connected tenants on service startup.
 * Scans auth_info/ for user directories that also have a SQLite DB
 * with selected communities, and re-establishes their Baileys sessions.
 */
async function restoreAllTenants() {
  if (!fs.existsSync(BASE_AUTH_DIR)) {
    console.log("🔄 [TenantRegistry] No auth_info directory — nothing to restore.");
    return;
  }

  const userDirs = fs.readdirSync(BASE_AUTH_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (userDirs.length === 0) {
    console.log("🔄 [TenantRegistry] No existing tenants to restore.");
    return;
  }

  console.log(`🔄 [TenantRegistry] Found ${userDirs.length} auth directories. Checking for restorable tenants...`);

  let restored = 0;

  for (const userId of userDirs) {
    try {
      // Check if a SQLite DB exists for this user
      const dbPath = path.join(BASE_DATA_DIR, userId, "uniquery.db");
      if (!fs.existsSync(dbPath)) {
        console.log(`⏭️  [TenantRegistry] Skipping ${userId} — no database found.`);
        continue;
      }

      // Open the database to check for selected communities or channels
      const db = createDatabase(userId);
      const selected = db.getSelectedCommunities();
      const selectedChannels = db.getSelectedChannels();

      if (selected.length === 0 && selectedChannels.length === 0) {
        console.log(`⏭️  [TenantRegistry] Skipping ${userId} — no selected communities or channels.`);
        db.close();
        continue;
      }

      // Retrieve persisted uid
      const uid = db.getMeta("uid") || null;

      console.log(
        `🔄 [TenantRegistry] Restoring tenant: ${userId} (${selected.length} communities, ${selectedChannels.length} channels, uid: ${uid ? "yes" : "none"})`
      );

      // connectTenant will call getTenant which creates a fresh DB handle,
      // so close this one to avoid holding two handles.
      db.close();

      // Stagger reconnections to avoid thundering herd
      if (restored > 0) {
        await new Promise((r) => setTimeout(r, 2000));
      }

      await connectTenant(userId, uid);
      restored++;
    } catch (err) {
      console.error(`❌ [TenantRegistry] Failed to restore tenant ${userId}:`, err.message);
    }
  }

  console.log(`🔄 [TenantRegistry] Restoration complete. ${restored} tenant(s) reconnected.`);
}

module.exports = {
  getTenant,
  connectTenant,
  disconnectTenant,
  getTenantStatus,
  getTenantQR,
  getTenantGroups,
  getTenantChannels,
  getTenantDB,
  getTenantContextManager,
  getActiveTenantCount,
  getTenantHistoricalMessages,
  restoreAllTenants,
};
