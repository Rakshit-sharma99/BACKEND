/**
 * Push Controller — internal endpoint for sending Firebase push notifications.
 *
 * Used by SERE and other internal services to send push notifications
 * without needing their own Firebase Admin instances.
 *
 * POST /universe/api/v1/push/send (internal auth only)
 */

const User = require("../models/user");
const { getMessaging } = require("firebase-admin/messaging");

/**
 * POST /universe/api/v1/push/send
 * Body: { userId, title, body, data }
 *
 * Internal-only endpoint (requires internal JWT from another service).
 */
const sendPush = async (req, res) => {
  try {
    // Only allow internal service calls
    if (!req.internalService) {
      return res.status(403).json({ error: "Internal access only." });
    }

    const { userId, title, body, data, image } = req.body;

    if (!userId || !title || !body) {
      return res
        .status(400)
        .json({ error: "userId, title, and body are required." });
    }

    // Look up user's push token
    const user = await User.findById(userId, { pushToken: 1 });
    if (!user || !user.pushToken) {
      return res
        .status(200)
        .json({ success: false, reason: "No push token found." });
    }

    const token = user.pushToken;
    if (!token || token === "undefined" || token.length < 10) {
      return res
        .status(200)
        .json({ success: false, reason: "Invalid push token." });
    }

    // Build FCM message
    const message = {
      notification: {
        title,
        body,
      },
      android: {
        notification: {
          imageUrl: image || undefined,
        },
      },
      apns: {
        payload: {
          aps: {
            alert: { title, body },
            sound: "default",
            "mutable-content": 1,
          },
        },
        fcm_options: {
          image: image || undefined,
        },
      },
      data: data
        ? Object.fromEntries(
            Object.entries(data).map(([k, v]) => [
              k,
              typeof v === "string" ? v : JSON.stringify(v),
            ]),
          )
        : {},
      token,
    };

    const response = await getMessaging().send(message);
    console.log("✅ Push sent via internal endpoint:", response);

    return res.status(200).json({ success: true, messageId: response });
  } catch (error) {
    console.error("❌ Push send error:", error);

    // Handle specific FCM errors gracefully
    if (
      error.code === "messaging/registration-token-not-registered" ||
      error.code === "messaging/invalid-registration-token"
    ) {
      return res
        .status(200)
        .json({ success: false, reason: "Token expired or invalid." });
    }

    return res.status(500).json({ error: "Could not send push notification." });
  }
};

module.exports = { sendPush };
