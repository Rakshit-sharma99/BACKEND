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

  // ── Channel (newsletter) cache ──
  // Stores discovered newsletter metadata: Map<jid, { id, name, participants, desc }>
  const channelCache = new Map();

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

    // ── Chat sync: primary channel discovery mechanism ──
    // Baileys fires chats.set during initial history sync with ALL chat types,
    // including @newsletter JIDs. This is the most reliable way to discover channels
    // since newsletter messages may not arrive (they're one-way broadcasts).
    sock.ev.on("chats.set", ({ chats }) => {
      if (!chats || chats.length === 0) return;
      let discovered = 0;
      for (const chat of chats) {
        if (chat.id?.endsWith("@newsletter") && !channelCache.has(chat.id)) {
          channelCache.set(chat.id, {
            id: chat.id,
            name: chat.name || chat.subject || chat.id.split("@")[0],
            participants: chat.participantCount || 0,
            desc: chat.description || null,
          });
          discovered++;
        }
      }
      if (discovered > 0) {
        console.log(
          `📡 [${userId}] Chat sync: discovered ${discovered} newsletter channels (total: ${channelCache.size})`
        );
      }
    });

    // Also listen for incremental chat updates (new subscriptions, metadata changes)
    sock.ev.on("chats.upsert", (chats) => {
      for (const chat of chats) {
        if (chat.id?.endsWith("@newsletter")) {
          channelCache.set(chat.id, {
            id: chat.id,
            name: chat.name || chat.subject || channelCache.get(chat.id)?.name || chat.id.split("@")[0],
            participants: chat.participantCount || channelCache.get(chat.id)?.participants || 0,
            desc: chat.description || channelCache.get(chat.id)?.desc || null,
          });
        }
      }
    });

    // ── Historical message sync (delivered by Baileys on connect) ──
    sock.ev.on("messaging-history.set", ({ messages: histMsgs, isLatest }) => {
      if (!histMsgs || histMsgs.length === 0) return;

      const cutoff = Math.floor(Date.now() / 1000) - HISTORY_MAX_AGE_DAYS * 86400;
      let added = 0;

      for (const msg of histMsgs) {
        if (totalCached >= HISTORY_MAX_TOTAL) break;

        const jid = msg.key?.remoteJid;
        if (!jid || jid.endsWith("@s.whatsapp.net")) continue;

        // Discover newsletter channels from history sync
        if (jid.endsWith("@newsletter") && !channelCache.has(jid)) {
          channelCache.set(jid, {
            id: jid,
            name: msg.pushName || jid.split("@")[0],
            participants: 0,
            desc: null,
          });
        }

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
        `📚 [${userId}] History sync: +${added} msgs (total: ${totalCached}, groups: ${historyCache.size}, channels: ${channelCache.size}, isLatest: ${isLatest})`
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

      // Cache ALL group/channel messages before the privacy filter
      // so they're available when a community/channel is selected later
      const cutoff = Math.floor(Date.now() / 1000) - HISTORY_MAX_AGE_DAYS * 86400;
      for (const msg of incoming) {
        if (totalCached >= HISTORY_MAX_TOTAL) break;
        const jid = msg.key?.remoteJid;
        if (!jid) continue;

        // Discover newsletter channels from live messages
        if (jid.endsWith("@newsletter") && !channelCache.has(jid)) {
          channelCache.set(jid, {
            id: jid,
            name: msg.pushName || jid.split("@")[0],
            participants: 0,
            desc: null,
          });
        }

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

  let cachedGroups = null;
  let lastGroupsFetchTime = 0;
  let groupsFetchPromise = null;
  const CACHE_TTL = 10000; // 10 seconds

  /**
   * Get all WhatsApp groups the user is in.
   */
  async function getGroups() {
    if (!sock || connectionState !== "open") return [];
    
    if (cachedGroups && Date.now() - lastGroupsFetchTime < CACHE_TTL) {
      return cachedGroups;
    }

    // Dedup: if a fetch is already in flight, wait for it instead of spamming Baileys
    if (groupsFetchPromise) {
      return groupsFetchPromise;
    }

    groupsFetchPromise = (async () => {
      try {
        const groups = await sock.groupFetchAllParticipating();
        cachedGroups = Object.values(groups).map((g) => ({
          id: g.id,
          name: g.subject,
          participants: g.participants?.length || 0,
          creation: g.creation,
          desc: g.desc || null,
        }));
        lastGroupsFetchTime = Date.now();
        return cachedGroups;
      } catch (err) {
        console.error(`[${userId}] Error fetching groups:`, err.message);
        return cachedGroups || [];
      } finally {
        groupsFetchPromise = null;
      }
    })();

    return groupsFetchPromise;
  }

  let lastChannelsFetchTime = 0;

  /**
   * Get all WhatsApp channels (newsletters) the user is subscribed to.
   * Since Baileys 6.7.16 lacks a strict getSubscribedNewsletters() method,
   * we rely exclusively on the channelCache populated by chats.set/upsert events.
   */
  async function getChannels() {
    if (!sock || connectionState !== "open") return [];
    
    // We must rely on our robust event listeners (chats.set, chats.upsert)
    // as groupFetchAllParticipating only fetches groups, and getSubscribedNewsletters
    // is not supported in this Baileys version.
    const cachedChannels = Array.from(channelCache.values());
    console.log(`📡 [${userId}] getChannels() → ${cachedChannels.length} channels from cache`);
    return cachedChannels;
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
    channelCache.clear();
    totalCached = 0;
    connectionState = "disconnected";
    currentQR = null;
    linkedPhoneInfo = null;
  }

  return {
    connect,
    getGroups,
    getChannels,
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
