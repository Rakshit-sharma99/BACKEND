/**
 * Socket.IO server — connection management, auth, and presence.
 *
 * Handles:
 *   - JWT authentication on handshake
 *   - Per-user rooms (user:{userId}) for targeted delivery
 *   - Presence registration/deregistration in Redis
 *   - Heartbeat-based TTL refresh
 *   - Client interaction events (dismiss, action) for analytics
 */

const jwt = require("jsonwebtoken");
const {
  registerSocket,
  unregisterSocket,
  refreshPresence,
} = require("../services/presenceManager");
const { flushPendingSummaries } = require("../services/liveNotificationDispatcher");
const LiveNotificationLog = require("../models/liveNotificationLog");

/**
 * Initialize Socket.IO event handling.
 *
 * @param {import("socket.io").Server} io — Socket.IO server instance
 */
function initSocket(io) {
  // ── Authentication middleware ──
  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token;

    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const payload = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

      // Internal service tokens are not allowed on the socket
      if (payload.role === "internal") {
        return next(new Error("Internal tokens cannot open socket connections"));
      }

      socket.userId = payload.id;
      socket.uid = payload.uid;
      socket.callSign = payload.callSign;

      return next();
    } catch (err) {
      return next(new Error("Invalid or expired token"));
    }
  });

  // ── Connection handler ──
  io.on("connection", async (socket) => {
    const userId = socket.userId;

    console.log(
      `🔌 SERE Socket: user ${userId} connected (socket: ${socket.id})`,
    );

    // Join the user's personal room (supports multiple devices)
    socket.join(`user:${userId}`);

    // Register presence in Redis
    await registerSocket(userId, socket.id);

    // Send acknowledgment
    socket.emit("presence:ack", {
      status: "connected",
      socketId: socket.id,
      userId,
      timestamp: Date.now(),
    });

    // Flush any pending condensation summaries on reconnect
    await flushPendingSummaries(userId);

    // ── Heartbeat ──
    socket.on("heartbeat", async () => {
      await refreshPresence(userId);
    });

    // ── Notification dismissed ──
    socket.on("notification:dismiss", async (data) => {
      try {
        const { notificationId } = data || {};
        if (!notificationId) return;

        await LiveNotificationLog.findOneAndUpdate(
          { notificationId },
          { $set: { dismissedAt: new Date() } },
        );
      } catch (err) {
        console.error("SERE Socket: dismiss log error:", err.message);
      }
    });

    // ── Notification action taken ──
    socket.on("notification:action", async (data) => {
      try {
        const { notificationId } = data || {};
        if (!notificationId) return;

        await LiveNotificationLog.findOneAndUpdate(
          { notificationId },
          { $set: { actionTakenAt: new Date() } },
        );
      } catch (err) {
        console.error("SERE Socket: action log error:", err.message);
      }
    });

    // ── Disconnect ──
    socket.on("disconnect", async (reason) => {
      console.log(
        `🔌 SERE Socket: user ${userId} disconnected (${reason})`,
      );
      await unregisterSocket(userId, socket.id);
    });
  });

  console.log("🔌 SERE Socket.IO initialized");
}

module.exports = { initSocket };
