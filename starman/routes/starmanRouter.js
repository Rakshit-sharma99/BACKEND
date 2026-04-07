const express = require("express");
const router = express.Router();

const { chat } = require("../controllers/chatController");
const {
  getCreditsAndQuestion,
  submitAnswer,
} = require("../controllers/creditChatController");
const {
  getTasks,
  getTaskDetail,
  retryTaskFailed,
  streamTasks,
} = require("../controllers/taskController");
const {
  getUserConversations,
  getConversation,
} = require("../session/sessionStore");
const {
  getMyIdentity,
  updateMyStarmanPersona,
  getSoul,
} = require("../controllers/identityController");

// POST /starman/api/v1/chat – SSE streaming chat
router.post("/chat", chat);

// GET /starman/api/v1/credits – Get credit balance + next question
router.get("/credits", getCreditsAndQuestion);

// POST /starman/api/v1/answer – Submit answer to earn credits
router.post("/answer", submitAnswer);

// GET /starman/api/v1/tasks – List user's tasks
router.get("/tasks", getTasks);

// GET /starman/api/v1/tasks/:taskId – Task detail with execution trace
router.get("/tasks/:taskId", getTaskDetail);

// POST /starman/api/v1/tasks/:taskId/retry – Retry a failed task
router.post("/tasks/:taskId/retry", retryTaskFailed);

// GET /starman/api/v1/tasks/stream – SSE stream for live task updates
router.get("/tasks/stream", streamTasks);

// GET /starman/api/v1/conversations – List user's conversation history
router.get("/conversations", async (req, res) => {
  try {
    const { limit, skip } = req.query;
    const conversations = await getUserConversations(req.user.id, {
      limit: limit ? parseInt(limit) : 20,
      skip: skip ? parseInt(skip) : 0,
    });
    res.json({ success: true, data: conversations });
  } catch (err) {
    console.error("[Router] Error fetching conversations:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch conversations" });
  }
});

// GET /starman/api/v1/conversations/:sessionId – Full conversation history
router.get("/conversations/:sessionId", async (req, res) => {
  try {
    const conversation = await getConversation(req.params.sessionId);
    if (!conversation) {
      return res.status(404).json({ success: false, message: "Conversation not found" });
    }
    if (conversation.userId.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: "Not authorized" });
    }
    res.json({ success: true, data: conversation });
  } catch (err) {
    console.error("[Router] Error fetching conversation:", err.message);
    res.status(500).json({ success: false, message: "Failed to fetch conversation" });
  }
});

// Identity endpoints
router.get("/identity/me", getMyIdentity);
router.patch("/identity/starman", updateMyStarmanPersona);
router.get("/identity/soul", getSoul);

module.exports = router;
