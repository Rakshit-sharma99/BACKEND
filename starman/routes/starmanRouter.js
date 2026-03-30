const express = require("express");
const router = express.Router();

const { chat } = require("../controllers/chatController");
const {
  getCreditsAndQuestion,
  submitAnswer,
} = require("../controllers/creditChatController");

// POST /starman/api/v1/chat – SSE streaming chat
router.post("/chat", chat);

// GET /starman/api/v1/credits – Get credit balance + next question
router.get("/credits", getCreditsAndQuestion);

// POST /starman/api/v1/answer – Submit answer to earn credits
router.post("/answer", submitAnswer);

module.exports = router;
