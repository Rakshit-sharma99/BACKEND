/**
 * Proactive Controller — Internal endpoint for SERE to inject
 * Starman-initiated messages into conversation history.
 *
 * POST /starman/api/v1/internal/proactive-message
 *
 * This creates a new Conversation session with origin="proactive",
 * inserts the message as role="model", and returns the sessionId
 * so the push notification can deep-link to this conversation.
 *
 * Auth: Internal service JWT only (from SERE).
 */

const { v4: uuidv4 } = require("uuid");
const Conversation = require("../models/conversationModel");
const { publishEvent } = require("../config/kafka");

// ── Conversation title templates ──
const PROACTIVE_TITLES = {
  memory_nudge: "✨ Evening Reflection",
  reflection: "💭 Weekly Reflection",
  check_in: "👋 Check-in",
  quest_prompt: "🎯 New Quest",
  reactivation: "🚀 Welcome Back",
  streak_milestone: "🔥 Streak Celebration",
  social_nudge: "👥 Friend Activity",
};

/**
 * POST /starman/api/v1/internal/proactive-message
 *
 * Body: {
 *   userId: string,        — target user's ObjectId
 *   uid: string,           — universe ObjectId
 *   messageText: string,   — the Starman message to inject
 *   proactiveMessageId: string, — SERE ProactiveMessage._id for tracking
 *   messageType: string,   — "memory_nudge", "reflection", etc.
 * }
 *
 * Response: { success: true, sessionId, conversationId }
 */
const createProactiveMessage = async (req, res) => {
  try {
    // Only allow internal service calls
    if (!req.internalService) {
      return res.status(403).json({ error: "Internal access only." });
    }

    const { userId, uid, messageText, proactiveMessageId, messageType } = req.body;

    if (!userId || !messageText) {
      return res
        .status(400)
        .json({ error: "userId and messageText are required." });
    }

    // 1. Find the latest active conversation within the last 24 hours
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    let conversation = await Conversation.findOne({
      userId,
      lastActive: { $gte: twentyFourHoursAgo },
    }).sort({ lastActive: -1 });

    let sessionId;

    if (conversation) {
      // Append to existing conversation
      sessionId = conversation.sessionId;
      const buttons = messageType === "memory_nudge" ? [{
        type: "memory_action",
        label: "Create Memory",
        subtitle: "Capture a moment from today ✨",
        action: {
          mode: "navigate",
          tab: "Home",
          navigateTo: "createPost",
          params: { mode: "memory" }
        }
      }] : [];

      conversation.messages.push({
        role: "model",
        text: messageText,
        timestamp: new Date(),
        buttons,
      });
      conversation.lastActive = new Date();
      
      // Update context if it was originally user-initiated to reflect it now has proactive context
      conversation.proactiveContext = {
        type: messageType || "memory_nudge",
        proactiveMessageId,
        triggeredBy: req.internalService || "sere",
      };
      
      await conversation.save();
      
      console.log(
        `✨ [Starman] Appended proactive message to existing conversation ${sessionId} for user ${userId} (type: ${messageType})`,
      );
    } else {
      // 2. Create a new conversation if no recent one exists
      sessionId = `proactive_${uuidv4()}`;
      conversation = await Conversation.create({
        userId,
        sessionId,
        title: PROACTIVE_TITLES[messageType] || "✨ Starman",
        origin: "proactive",
        proactiveContext: {
          type: messageType || "memory_nudge",
          proactiveMessageId,
          triggeredBy: req.internalService || "sere",
        },
        messages: [
          {
            role: "model",
            text: messageText,
            timestamp: new Date(),
            buttons: messageType === "memory_nudge" ? [{
              type: "memory_action",
              label: "Create Memory",
              subtitle: "Capture a moment from today ✨",
              action: {
                mode: "navigate",
                tab: "Home",
                navigateTo: "createPost",
                params: { mode: "memory" }
              }
            }] : [],
          },
        ],
        lastActive: new Date(),
      });

      console.log(
        `✨ [Starman] Created new proactive conversation ${sessionId} for user ${userId} (type: ${messageType})`,
      );
    }

    return res.status(201).json({
      success: true,
      sessionId,
      conversationId: conversation._id.toString(),
    });
  } catch (error) {
    console.error("❌ [Starman] Proactive message creation error:", error);
    return res.status(500).json({ error: "Failed to create proactive message." });
  }
};

module.exports = { createProactiveMessage };
