const express = require("express");
const router = express.Router();

const { submitAnswer } = require("../controllers/answerController");
const { queryInsight, getInsight } = require("../controllers/insightController");
const {
  getUserProfile,
  getAnsweredIds,
} = require("../controllers/userKnowledgeController");
const {
  linkEntity,
  ingestMessages,
  searchContext,
  getStatus,
  getUserStats,
  getUserContexts,
  getContextEntries,
  deleteContext,
} = require("../controllers/externalContextController");

// Answers
router.post("/answer", submitAnswer);

// Insights
router.get("/insight/query", queryInsight);
router.get("/insight/:questionId", getInsight);

// User knowledge profiles
router.get("/user/:userId/profile", getUserProfile);
router.get("/user/:userId/answered-ids", getAnsweredIds);

// External network context
router.post("/external/link", linkEntity);
router.post("/external/ingest", ingestMessages);
router.get("/external/search", searchContext);
router.get("/external/status", getStatus);
router.get("/external/user-stats", getUserStats);
router.get("/external/user-contexts", getUserContexts);
router.get("/external/user-contexts/:id/entries", getContextEntries);
router.delete("/external/user-contexts/:id", deleteContext);

module.exports = router;
