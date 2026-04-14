/**
 * Conversation Controller — Endpoints for chat history browsing.
 *
 * Supports:
 *   • Listing conversation summaries (paginated)
 *   • Fetching paginated messages for a single conversation
 *   • Fetching the user's latest conversation for auto-resume
 */

const Conversation = require("../models/conversationModel");

/**
 * GET /conversations
 * Query: ?limit=20&skip=0
 *
 * Returns a list of conversation summaries (no full messages).
 */
const getUserConversations = async (req, res) => {
  try {
    const { limit, skip } = req.query;
    const conversations = await Conversation.find({ userId: req.user.id })
      .select("sessionId title lastActive createdAt messages")
      .sort({ lastActive: -1 })
      .skip(skip ? parseInt(skip) : 0)
      .limit(limit ? parseInt(limit) : 20)
      .lean()
      .then((convs) =>
        convs.map((c) => ({
          sessionId: c.sessionId,
          title: c.title,
          lastActive: c.lastActive,
          createdAt: c.createdAt,
          messageCount: c.messages?.length || 0,
          lastMessage:
            c.messages?.[c.messages.length - 1]?.text?.substring(0, 100) ||
            null,
        })),
      );

    res.json({ success: true, data: conversations });
  } catch (err) {
    console.error("[ConversationController] getUserConversations error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch conversations" });
  }
};

/**
 * GET /conversations/latest
 *
 * Returns the user's most recent conversation if it was active within 24 hours.
 * Includes the latest page of messages (newest 30).
 * Used by the frontend to auto-resume where the user left off.
 */
const getLatestConversation = async (req, res) => {
  try {
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const conversation = await Conversation.findOne({
      userId: req.user.id,
      lastActive: { $gte: twentyFourHoursAgo },
    })
      .sort({ lastActive: -1 })
      .lean();

    if (!conversation) {
      return res.json({ success: true, data: null });
    }

    const totalMessages = conversation.messages?.length || 0;
    const pageSize = 30;
    const startIndex = Math.max(0, totalMessages - pageSize);
    const latestMessages = (conversation.messages || []).slice(startIndex);

    res.json({
      success: true,
      data: {
        sessionId: conversation.sessionId,
        title: conversation.title,
        lastActive: conversation.lastActive,
        createdAt: conversation.createdAt,
        messages: latestMessages,
        totalMessages,
        hasMore: startIndex > 0,
        nextPage: startIndex > 0 ? 2 : null,
      },
    });
  } catch (err) {
    console.error("[ConversationController] getLatestConversation error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch latest conversation" });
  }
};

/**
 * GET /conversations/:sessionId/messages
 * Query: ?page=1&limit=30
 *
 * Returns a paginated slice of messages (oldest-first within the page).
 * Page 1 = most recent 30 messages, page 2 = the 30 before that, etc.
 *
 * Response: { messages, hasMore, nextPage, totalMessages }
 */
const getConversationMessages = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 30));

    const conversation = await Conversation.findOne({ sessionId }).lean();

    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    // Authorization check
    if (conversation.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    const totalMessages = conversation.messages?.length || 0;

    // Calculate slice — page 1 is newest, page 2 is the batch before that, etc.
    const endIndex = Math.max(0, totalMessages - (page - 1) * limit);
    const startIndex = Math.max(0, endIndex - limit);
    const messages = (conversation.messages || []).slice(startIndex, endIndex);

    res.json({
      success: true,
      data: {
        messages,
        totalMessages,
        hasMore: startIndex > 0,
        nextPage: startIndex > 0 ? page + 1 : null,
        currentPage: page,
      },
    });
  } catch (err) {
    console.error("[ConversationController] getConversationMessages error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch messages" });
  }
};

/**
 * GET /conversations/:sessionId
 *
 * Returns full conversation metadata + messages.
 */
const getConversation = async (req, res) => {
  try {
    const conversation = await Conversation.findOne({
      sessionId: req.params.sessionId,
    }).lean();

    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }

    if (conversation.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }

    res.json({ success: true, data: conversation });
  } catch (err) {
    console.error("[ConversationController] getConversation error:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch conversation" });
  }
};

module.exports = {
  getUserConversations,
  getLatestConversation,
  getConversationMessages,
  getConversation,
};
