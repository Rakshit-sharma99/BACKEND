const express = require("express");
const router = express.Router();

const { submitAnswer } = require("../controllers/answerController");
const { queryInsight, getInsight } = require("../controllers/insightController");
const {
  getUserProfile,
  getAnsweredIds,
} = require("../controllers/userKnowledgeController");

// Answers
router.post("/answer", submitAnswer);

// Insights
router.get("/insight/query", queryInsight);
router.get("/insight/:questionId", getInsight);

// User knowledge profiles
router.get("/user/:userId/profile", getUserProfile);
router.get("/user/:userId/answered-ids", getAnsweredIds);

module.exports = router;
