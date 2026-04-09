/**
 * Session Manager — per-user Baileys WhatsApp connection lifecycle.
 *
 * Unlike the original singleton, this module exports a function
 * that creates an isolated Baileys session for a specific user.
 */

// @whiskeysockets/baileys is ESM-only — use dynamic import() with a cache.
let _baileys = null;
async function getBaileys() {
  if (!_baileys) {
    _baileys = await import("@whiskeysockets/baileys");
  }
  return _baileys;
}

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
  const HISTORY_MAX_PER_GROUP = 3000;  // Max messages cached per JID (supports deep sync)
  const HISTORY_MAX_TOTAL = 15000;     // Max messages across all groups
  const HISTORY_MAX_AGE_DAYS = 30;     // Only cache messages from last 30 days
  const historyCache = new Map();
  let totalCached = 0;

  // ── Pending deep-sync resolvers: jid → [resolve, ...] ──
  const pendingHistoryResolves = new Map();

  // ── History sync completion tracking ──
  let historySyncComplete = false;
  let historySyncResolve = null;
  let historySyncIdleTimer = null;
  const HISTORY_SYNC_IDLE_MS = 5000; // mark complete after 5s of no new events
  const historySyncPromise = new Promise((resolve) => { historySyncResolve = resolve; });

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

    const baileys = await getBaileys();
    const makeWASocket = baileys.makeWASocket || baileys.default?.makeWASocket || baileys.default;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

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
          // Logged out — clear stale credentials and restart for fresh QR
          console.log(`🔑 [${userId}] Clearing stale credentials and restarting for fresh QR...`);
          if (fs.existsSync(authDir)) {
            fs.rmSync(authDir, { recursive: true, force: true });
            fs.mkdirSync(authDir, { recursive: true });
          }
          // Restart connection so a new QR code is generated
          if (!destroyed) {
            if (reconnectTimer) clearTimeout(reconnectTimer);
            reconnectTimer = setTimeout(() => connect(), 2000);
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

      // Wake up any pending deep-sync waiters for JIDs that received messages
      for (const jid of historyCache.keys()) {
        if (pendingHistoryResolves.has(jid)) {
          const resolvers = pendingHistoryResolves.get(jid);
          pendingHistoryResolves.delete(jid);
          for (const resolve of resolvers) resolve();
        }
      }

      // Reset the idle timer — mark sync complete after 5s of no new events
      if (historySyncIdleTimer) clearTimeout(historySyncIdleTimer);
      historySyncIdleTimer = setTimeout(() => {
        if (!historySyncComplete) {
          historySyncComplete = true;
          console.log(`⏳ [${userId}] History sync idle — marking complete (total: ${totalCached} msgs, ${historyCache.size} groups)`);
          if (historySyncResolve) historySyncResolve();
        }
      }, HISTORY_SYNC_IDLE_MS);
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

  /**
   * Actively fetch historical messages for a specific group from the phone.
   * Uses Baileys' HISTORY_SYNC_ON_DEMAND protocol to request messages,
   * then waits for them to arrive via messaging-history.set.
   *
   * @param {string} jid          Community/group JID
   * @param {number} count        Number of messages to request
   * @param {string} anchorMsgId  Real Baileys message key ID of the oldest known message
   * @param {number} anchorTs     Timestamp (ms) of the oldest known message
   * @returns {Array} Cached messages for this JID after fetch
   */
  async function fetchGroupMessages(jid, count = 500, anchorMsgId = null, anchorTs = null) {
    if (!sock || connectionState !== "open") {
      console.warn(`[${userId}] fetchGroupMessages: not connected`);
      return historyCache.get(jid) || [];
    }

    if (!anchorMsgId) {
      console.warn(`[${userId}] fetchGroupMessages: no anchor message — cannot request on-demand history`);
      return historyCache.get(jid) || [];
    }

    const oldestMsgKey = {
      remoteJid: jid,
      fromMe: false,
      id: anchorMsgId,
    };

    const oldestTimestamp = anchorTs || (Date.now() - 30 * 86400 * 1000);

    try {
      console.log(`🔎 [${userId}] Requesting ${count} messages from phone for ${jid} (anchor: ${anchorMsgId})...`);
      await sock.fetchMessageHistory(count, oldestMsgKey, oldestTimestamp);
    } catch (err) {
      console.error(`[${userId}] fetchMessageHistory failed for ${jid}:`, err.message);
      return historyCache.get(jid) || [];
    }

    // Wait for messages to arrive via messaging-history.set (up to 15 seconds)
    const beforeCount = (historyCache.get(jid) || []).length;
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 15000); // max wait

      // Register a resolver so the history handler can wake us early
      if (!pendingHistoryResolves.has(jid)) {
        pendingHistoryResolves.set(jid, []);
      }
      pendingHistoryResolves.get(jid).push(() => {
        clearTimeout(timer);
        resolve();
      });
    });

    const afterCount = (historyCache.get(jid) || []).length;
    console.log(
      `📚 [${userId}] fetchGroupMessages(${jid}): before=${beforeCount}, after=${afterCount}, delta=+${afterCount - beforeCount}`
    );

    return historyCache.get(jid) || [];
  }

  /**
   * Force a fresh history sync by clearing Baileys' "already synced" markers
   * and reconnecting. This preserves auth (no QR re-scan needed) but forces
   * the phone to re-deliver all historical messages.
   *
   * @param {string} targetJid  Optional JID to watch for in the history cache
   * @returns {number} Number of messages received for targetJid (or total new messages)
   */
  async function requestHistoryResync(targetJid = null) {
    if (!sock || connectionState !== "open") {
      console.warn(`[${userId}] requestHistoryResync: not connected`);
      return 0;
    }

    const beforeCount = targetJid ? (historyCache.get(targetJid) || []).length : totalCached;

    // Clear processed history markers so Baileys re-requests full history
    const { useMultiFileAuthState } = await getBaileys();
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    if (state.creds.processedHistoryMessages) {
      console.log(`🔄 [${userId}] Clearing ${state.creds.processedHistoryMessages.length} processed history markers...`);
      state.creds.processedHistoryMessages = [];
      await saveCreds();
    }

    // Tear down and reconnect (keeps auth, forces fresh history sync)
    console.log(`🔄 [${userId}] Reconnecting for fresh history sync...`);
    try { sock.end(); } catch (_) {}
    sock = null;
    connectionState = "disconnected";

    await connect();

    // Wait for history to arrive (up to 25 seconds)
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 25000);

      if (targetJid) {
        if (!pendingHistoryResolves.has(targetJid)) {
          pendingHistoryResolves.set(targetJid, []);
        }
        pendingHistoryResolves.get(targetJid).push(() => {
          clearTimeout(timer);
          // Give a small extra window for additional batches
          setTimeout(resolve, 3000);
        });
      }
    });

    const afterCount = targetJid ? (historyCache.get(targetJid) || []).length : totalCached;
    console.log(
      `📚 [${userId}] requestHistoryResync: before=${beforeCount}, after=${afterCount}, delta=+${afterCount - beforeCount}`
    );

    return afterCount - beforeCount;
  }

  /**
   * Request a pairing code for phone-number-based linking.
   *
   * QR and pairing-code are mutually exclusive in Baileys — you cannot call
   * requestPairingCode on a socket that already entered QR mode. So we tear
   * down the current socket and create a fresh one specifically for pairing.
   *
   * @param {string} phoneNumber — Full international number (e.g. "919876543210")
   * @returns {string} 8-character pairing code
   */
  async function requestPairingCode(phoneNumber) {
    // Strip everything except digits
    const cleaned = phoneNumber.replace(/[^\d]/g, "");
    if (cleaned.length < 10) {
      throw new Error("Invalid phone number — must include country code");
    }

    // Tear down any existing socket
    if (sock) {
      try { sock.end(); } catch (_) {}
      sock = null;
    }
    // Clear any reconnect timer the old socket's close handler may have scheduled.
    // sock.end() fires a close event whose handler schedules connect() in 3s —
    // that stale timer would create a competing QR-mode socket mid-pairing.
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    connectionState = "connecting";
    currentQR = null;

    const baileys = await getBaileys();
    const makeWASocket = baileys.makeWASocket || baileys.default?.makeWASocket || baileys.default;
    const { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = baileys;

    // Clear stale auth so Baileys starts a fresh un-registered session
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
      fs.mkdirSync(authDir, { recursive: true });
    }

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState(authDir);

    const logger = pino({ level: "silent" });

    sock = makeWASocket({
      version,
      auth: state,
      logger,
      printQRInTerminal: false,
      browser: ["Macbease Starman", "Desktop", "20.0.04"],
      syncFullHistory: true,
    });

    // Persist creds on this new socket
    sock.ev.on("creds.update", saveCreds);

    // Track whether the pairing code has been returned to the caller.
    // During the handshake, Baileys may close/reopen the WS multiple times
    // (status undefined). We must NOT reconnect via connect() during this
    // window — doing so creates a QR-mode socket that conflicts with the
    // pairing negotiation and triggers an immediate 401 loop.
    let pairingCodeResolved = false;
    let pairingSucceeded = false;

    const code = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("Timed out waiting for WhatsApp server — try again"));
      }, 30000);

      sock.ev.on("connection.update", async (update) => {
        if (destroyed) {
          clearTimeout(timeout);
          return reject(new Error("Session destroyed"));
        }

        const { connection, lastDisconnect, qr } = update;

        if (qr && !pairingCodeResolved) {
          // Server is ready — request pairing code instead of showing QR
          try {
            const pairingCode = await sock.requestPairingCode(cleaned);
            clearTimeout(timeout);
            pairingCodeResolved = true;
            console.log(`📲 [${userId}] Pairing code generated for ${cleaned}: ${pairingCode}`);
            resolve(pairingCode);
          } catch (err) {
            clearTimeout(timeout);
            console.error(`[${userId}] Pairing code request failed:`, err.message);
            reject(new Error("Could not generate pairing code — try again"));
          }
        }

        if (connection === "open") {
          pairingSucceeded = true;
          connectionState = "open";
          currentQR = null;
          linkedPhoneInfo = sock.user || null;
          console.log(`✅ [${userId}] WhatsApp connected via pairing code: ${linkedPhoneInfo?.id || "unknown"}`);

          // Transition to the full session with all event listeners.
          // The current socket has partial listeners; reconnecting via
          // connect() wires up history sync, chats.set, etc.
          console.log(`🔄 [${userId}] Transitioning pairing socket to full session...`);
          if (reconnectTimer) clearTimeout(reconnectTimer);
          reconnectTimer = setTimeout(() => connect(), 1000);
        }

        if (connection === "close") {
          const statusCode =
            lastDisconnect?.error?.output?.statusCode ||
            lastDisconnect?.error?.statusCode;

          if (!pairingCodeResolved) {
            // Pairing code hasn't been returned yet — this is a fatal failure
            connectionState = "disconnected";
            console.log(`❌ [${userId}] Connection closed before pairing code was generated (status: ${statusCode})`);
            // Don't reconnect — let the promise timeout or the user retry
          } else if (pairingSucceeded) {
            // Already connected once — use normal reconnect logic
            connectionState = "disconnected";
            const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
            console.log(
              `❌ [${userId}] Post-pairing connection closed (status: ${statusCode}). ${shouldReconnect ? "Reconnecting..." : "Logged out."}`,
              lastDisconnect?.error || "No error attached"
            );
            if (shouldReconnect && !destroyed) {
              if (reconnectTimer) clearTimeout(reconnectTimer);
              reconnectTimer = setTimeout(() => connect(), 3000);
            }
          } else {
            // Pairing code was returned but user hasn't entered it yet.
            // Interim WS closes (status undefined) are NORMAL during the
            // Baileys pairing handshake. We MUST reconnect so a live socket
            // exists to receive the "open" event when the user enters the code.
            // connect() uses the EXISTING auth dir (creds saved by saveCreds)
            // so the server can complete the pairing handshake.

            if (statusCode === DisconnectReason.loggedOut) {
              // 401 = pairing was rejected or timed out on the WA server side
              connectionState = "disconnected";
              console.log(`🔑 [${userId}] Pairing rejected (401). Clearing credentials for fresh start...`);
              if (fs.existsSync(authDir)) {
                fs.rmSync(authDir, { recursive: true, force: true });
                fs.mkdirSync(authDir, { recursive: true });
              }
              if (!destroyed) {
                if (reconnectTimer) clearTimeout(reconnectTimer);
                reconnectTimer = setTimeout(() => connect(), 2000);
              }
            } else if (!destroyed) {
              // Non-fatal close — reconnect to keep the session alive
              console.log(
                `⏳ [${userId}] Interim connection close during pairing (status: ${statusCode}) — reconnecting to await code entry...`
              );
              connectionState = "pairing";
              if (reconnectTimer) clearTimeout(reconnectTimer);
              reconnectTimer = setTimeout(() => connect(), 2000);
            }
          }
        }
      });

      // Wire up message listeners on the new socket too
      sock.ev.on("messages.upsert", ({ messages, type }) => {
        if (type !== "notify") return;
        const incoming = messages.filter(
          (m) => !m.key.fromMe && m.message && !m.key.remoteJid.endsWith("@s.whatsapp.net"),
        );
        if (incoming.length > 0 && messageCallback) {
          messageCallback(incoming);
        }
      });
    });

    return code;
  }

  return {
    connect,
    getGroups,
    getChannels,
    getStatus,
    getQR,
    requestPairingCode,
    logout,
    destroy,
    getHistoricalMessages,
    fetchGroupMessages,
    requestHistoryResync,
    /**
     * Wait for Baileys history sync to complete.
     * Resolves immediately if already done, otherwise waits up to 60s.
     */
    async waitForHistorySync() {
      if (historySyncComplete) return;
      // Race between the sync promise and a 60s safety timeout
      await Promise.race([
        historySyncPromise,
        new Promise((r) => setTimeout(r, 60000)),
      ]);
    },
    get userId() {
      return userId;
    },
  };
}

module.exports = { createSession };
