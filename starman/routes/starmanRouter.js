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
  getLatestConversation,
  getConversationMessages,
  getConversation,
} = require("../controllers/conversationController");
const {
  getMyIdentity,
  updateMyStarmanPersona,
  getSoul,
} = require("../controllers/identityController");
const {
  createProactiveMessage,
} = require("../controllers/proactiveController");

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

// GET /starman/api/v1/conversations – List user's conversation summaries
router.get("/conversations", getUserConversations);

// GET /starman/api/v1/conversations/latest – Latest conversation for auto-resume
// (must be defined before :sessionId to avoid route conflict)
router.get("/conversations/latest", getLatestConversation);

// GET /starman/api/v1/conversations/:sessionId/messages – Paginated messages
router.get("/conversations/:sessionId/messages", getConversationMessages);

// GET /starman/api/v1/conversations/:sessionId – Full conversation
router.get("/conversations/:sessionId", getConversation);

// Identity endpoints
router.get("/identity/me", getMyIdentity);
router.patch("/identity/starman", updateMyStarmanPersona);
router.get("/identity/soul", getSoul);

// Internal proactive message endpoint (SERE → Starman)
router.post("/internal/proactive-message", createProactiveMessage);

module.exports = router;
