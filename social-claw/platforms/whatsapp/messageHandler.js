/**
 * Message Handler — normalizes and filters incoming WhatsApp messages.
 *
 * Privacy boundary: only processes messages from selected communities.
 * Tenant-aware: requires a database instance scoped to the user.
 */

const { publishEvent } = require("../../config/kafka");

/**
 * Extract text content from a Baileys message object.
 */
function extractText(message) {
  if (!message) return null;
  return (
    message.conversation ||
    message.extendedTextMessage?.text ||
    message.imageMessage?.caption ||
    message.videoMessage?.caption ||
    message.documentMessage?.caption ||
    message.listResponseMessage?.title ||
    message.buttonsResponseMessage?.selectedDisplayText ||
    null
  );
}

/**
 * Extract media metadata (filename, type, size) without the actual content.
 */
function extractMediaMetadata(message) {
  if (!message) return null;

  const mediaTypes = [
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "documentMessage",
    "stickerMessage",
  ];

  for (const type of mediaTypes) {
    if (message[type]) {
      const m = message[type];
      return {
        type: type.replace("Message", ""),
        mimetype: m.mimetype || null,
        fileLength: m.fileLength ? Number(m.fileLength) : null,
        fileName: m.fileName || null,
        seconds: m.seconds || null,
      };
    }
  }

  return null;
}

/**
 * Process an array of raw Baileys messages.
 * Filters, normalizes, and stores them in the hot tier.
 * Also publishes to Kafka for knowledge service ingestion.
 *
 * @param {Array} rawMessages - Raw Baileys message objects
 * @param {object} db - User-scoped database instance
 * @param {string} userId - The authenticated user's ID
 * @param {boolean} skipKafka - If true, do not publish to Kafka (useful for historical bulk inserts)
 * @returns {{ ingested: number, dropped: number }}
 */
function processMessages(rawMessages, db, userId, uid, skipKafka = false) {
  let ingested = 0;
  let dropped = 0;
  const forKafka = []; // Messages to forward to knowledge service

  for (const raw of rawMessages) {
    const remoteJid = raw.key?.remoteJid;
    if (!remoteJid) {
      dropped++;
      continue;
    }

    const communityId = remoteJid;

    // ── PRIVACY BOUNDARY: Drop if community not selected ──
    if (!db.isCommunitySelected(communityId)) {
      dropped++;
      continue;
    }

    const text = extractText(raw.message);
    const mediaMetadata = extractMediaMetadata(raw.message);

    if (!text && !mediaMetadata) {
      dropped++;
      continue;
    }

    const sender = raw.key.participant || raw.key.remoteJid;
    const senderName =
      raw.pushName || raw.key.participant?.split("@")[0] || "Unknown";

    const selectedCommunities = db.getSelectedCommunities();
    const community = selectedCommunities.find((c) => c.id === communityId);
    const communityName = community?.name || communityId;

    const normalized = {
      id: raw.key.id + "_" + communityId,
      communityId,
      communityName,
      sender,
      senderName,
      text: text || (mediaMetadata ? `[${mediaMetadata.type}]` : ""),
      timestamp: raw.messageTimestamp
        ? Number(raw.messageTimestamp)
        : Math.floor(Date.now() / 1000),
      mediaMetadata,
    };

    try {
      db.insertMessage(normalized);
      ingested++;

      // Collect for Kafka batch publish
      if (text) {
        forKafka.push({
          text: normalized.text,
          sender: normalized.senderName,
          timestamp: normalized.timestamp,
          entityId: communityId,
          entityName: communityName,
        });
      }
    } catch (err) {
      console.error("Error inserting message:", err.message);
      dropped++;
    }
  }

  // Publish to Kafka in batch (grouped by entity)
  if (!skipKafka && forKafka.length > 0 && uid) {
    const grouped = {};
    for (const msg of forKafka) {
      if (!grouped[msg.entityId]) grouped[msg.entityId] = [];
      grouped[msg.entityId].push(msg);
    }

    for (const [entityId, messages] of Object.entries(grouped)) {
      publishEvent("network.message.new", {
        uid,
        entityId,
        userId,
        messages: messages.map((m) => ({
          text: m.text,
          sender: m.sender,
          timestamp: m.timestamp,
        })),
      });
    }
  }

  return { ingested, dropped };
}

module.exports = { processMessages, extractText, extractMediaMetadata };

