/**
 * Session Manager — per-user Baileys WhatsApp connection lifecycle.
 *
 * Unlike the original singleton, this module exports a function
 * that creates an isolated Baileys session for a specific user.
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys");
const pino = require("pino");
const path = require("path");
const fs = require("fs");
const QRCode = require("qrcode");

const BASE_AUTH_DIR = path.join(__dirname, "../../auth_info");

/**
 * Create an isolated WhatsApp session for a given user.
 *
 * @param {string} userId - The user ID (for directory isolation)
 * @param {function} messageCallback - Called when new group messages arrive
 * @returns {object} - Session control object
 */
async function createSession(userId, messageCallback) {
  const authDir = path.join(BASE_AUTH_DIR, userId);

  // Ensure auth directory exists
  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  // ── Session State ──
  let sock = null;
  let connectionState = "disconnected"; // disconnected | connecting | qr | open
  let currentQR = null;
  let linkedPhoneInfo = null;
  let reconnectTimer = null;
  let destroyed = false;

  // ── History cache with constraints ──
  const HISTORY_MAX_PER_GROUP = 500;   // Max messages cached per JID
  const HISTORY_MAX_TOTAL = 5000;      // Max messages across all groups
  const HISTORY_MAX_AGE_DAYS = 30;     // Only cache messages from last 30 days
  const historyCache = new Map();
  let totalCached = 0;

  /**
   * Start or restart the Baileys connection.
   */
  async function connect() {
    if (destroyed) return;

    if (sock) {
      try {
        sock.end();
      } catch (_) {}
    }

    connectionState = "connecting";
    currentQR = null;

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const logger = pino({ level: "silent" });

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      browser: ["Macbease Starman", "Desktop", "20.0.04"],
      syncFullHistory: true,
    });

    // ── Connection updates ──
    sock.ev.on("connection.update", async (update) => {
      if (destroyed) return;

      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          currentQR = await QRCode.toDataURL(qr, {
            width: 300,
            margin: 2,
            color: { dark: "#000", light: "#fff" },
          });
          connectionState = "qr";
          console.log(`📱 [${userId}] QR code generated — scan with WhatsApp`);
        } catch (err) {
          console.error(`[${userId}] QR generation error:`, err.message);
        }
      }

      if (connection === "open") {
        connectionState = "open";
        currentQR = null;
        linkedPhoneInfo = sock.user || null;
        console.log(
          `✅ [${userId}] WhatsApp connected: ${linkedPhoneInfo?.id || "unknown"}`,
        );
      }

      if (connection === "close") {
        connectionState = "disconnected";
        const statusCode =
          lastDisconnect?.error?.output?.statusCode ||
          lastDisconnect?.error?.statusCode;

        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(
          `❌ [${userId}] Connection closed (status: ${statusCode}). ${shouldReconnect ? "Reconnecting..." : "Logged out."}`,
          lastDisconnect?.error || "No error attached"
        );

        if (shouldReconnect && !destroyed) {
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => connect(), 3000);
        } else {
          // Logged out — clear credentials
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
            fs.mkdirSync(authDir, { recursive: true });
          }
        }
      }
    });

    // ── Credential persistence ──
    sock.ev.on("creds.update", saveCreds);

    // ── Historical message sync (delivered by Baileys on connect) ──
    sock.ev.on("messaging-history.set", ({ messages: histMsgs, isLatest }) => {
      if (!histMsgs || histMsgs.length === 0) return;

      const cutoff = Math.floor(Date.now() / 1000) - HISTORY_MAX_AGE_DAYS * 86400;
      let added = 0;

      for (const msg of histMsgs) {
        if (totalCached >= HISTORY_MAX_TOTAL) break;

        const jid = msg.key?.remoteJid;
        if (!jid || jid.endsWith("@s.whatsapp.net")) continue;

        const ts = msg.messageTimestamp ? Number(msg.messageTimestamp) : 0;
        if (ts < cutoff) continue;

        if (!historyCache.has(jid)) historyCache.set(jid, []);
        const group = historyCache.get(jid);
        if (group.length >= HISTORY_MAX_PER_GROUP) continue;

        group.push(msg);
        totalCached++;
        added++;
      }

      console.log(
        `📚 [${userId}] History sync: +${added} msgs (total: ${totalCached}, groups: ${historyCache.size}, isLatest: ${isLatest})`
      );
    });

    // ── Incoming messages ──
    sock.ev.on("messages.upsert", ({ messages, type }) => {
      if (type !== "notify") return;

      const incoming = messages.filter(
        (m) =>
          !m.key.fromMe &&
          m.message &&
          !m.key.remoteJid.endsWith("@s.whatsapp.net"),
      );

      // Cache ALL group messages before the privacy filter
      // so they're available when a community is selected later
      const cutoff = Math.floor(Date.now() / 1000) - HISTORY_MAX_AGE_DAYS * 86400;
      for (const msg of incoming) {
        if (totalCached >= HISTORY_MAX_TOTAL) break;
        const jid = msg.key?.remoteJid;
        if (!jid) continue;
        const ts = msg.messageTimestamp ? Number(msg.messageTimestamp) : Math.floor(Date.now() / 1000);
        if (ts < cutoff) continue;
        if (!historyCache.has(jid)) historyCache.set(jid, []);
        const group = historyCache.get(jid);
        if (group.length >= HISTORY_MAX_PER_GROUP) continue;
        group.push(msg);
        totalCached++;
      }

      if (incoming.length > 0 && messageCallback) {
        messageCallback(incoming);
      }
    });

    return sock;
  }

  /**
   * Get all WhatsApp groups the user is in.
   */
  async function getGroups() {
    if (!sock || connectionState !== "open") return [];
    try {
      const groups = await sock.groupFetchAllParticipating();
      return Object.values(groups).map((g) => ({
        id: g.id,
        name: g.subject,
        participants: g.participants?.length || 0,
        creation: g.creation,
        desc: g.desc || null,
      }));
    } catch (err) {
      console.error(`[${userId}] Error fetching groups:`, err.message);
      return [];
    }
  }

  /**
   * Get current connection status.
   */
  function getStatus() {
    return {
      state: connectionState,
      phone: linkedPhoneInfo
        ? {
            id: linkedPhoneInfo.id,
            name: linkedPhoneInfo.name || null,
          }
        : null,
    };
  }

  /**
   * Get the current QR code (base64 data URL) or null.
   */
  function getQR() {
    return currentQR;
  }

  /**
   * Disconnect and clear session.
   */
  async function logout() {
    if (sock) {
      try {
        await sock.logout();
      } catch (_) {}
      sock = null;
    }
    connectionState = "disconnected";
    currentQR = null;
    linkedPhoneInfo = null;
  }

  /**
   * Get cached historical messages for a specific community (JID)
   */
  function getHistoricalMessages(jid, limit = 500) {
    const cached = historyCache.get(jid) || [];
    console.log(
      `📚 [${userId}] getHistoricalMessages(${jid}): ${cached.length} messages in cache`
    );
    return cached.slice(-limit);
  }

  /**
   * Hard destroy the session (for idle cleanup).
   */
  async function destroy() {
    destroyed = true;
    if (sock) {
      try {
        sock.end();
      } catch (_) {}
      sock = null;
    }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    historyCache.clear();
    totalCached = 0;
    connectionState = "disconnected";
    currentQR = null;
    linkedPhoneInfo = null;
  }

  return {
    connect,
    getGroups,
    getStatus,
    getQR,
    logout,
    destroy,
    getHistoricalMessages,
    get userId() {
      return userId;
    },
  };
}

module.exports = { createSession };
