const express = require("express");
const router = express.Router();

const { chat } = require("../controllers/chatController");

// POST /starman/api/v1/chat – SSE streaming chat
router.post("/chat", chat);

module.exports = router;
