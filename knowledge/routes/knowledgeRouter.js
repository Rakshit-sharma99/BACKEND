const express = require("express");
const router = express.Router();

const { submitAnswer } = require("../controllers/answerController");
const { queryInsight, getInsight } = require("../controllers/insightController");
const {
  getUserProfile,
  getAnsweredIds,
  getIdentityContext,
  updateStarmanPersona,
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
  batchDeleteContexts,
  deepSync,
  saveRelayedContentId,
  getRelayedContents,
} = require("../controllers/externalContextController");

// Answers
router.post("/answer", submitAnswer);

// Insights
router.get("/insight/query", queryInsight);
router.get("/insight/:questionId", getInsight);

// User knowledge profiles
router.get("/user/:userId/profile", getUserProfile);
router.get("/user/:userId/answered-ids", getAnsweredIds);
router.get("/user/:userId/identity-context", getIdentityContext);
router.patch("/user/:userId/starman-persona", updateStarmanPersona);

// External network context
router.post("/external/link", linkEntity);
router.post("/external/ingest", ingestMessages);
router.get("/external/search", searchContext);
router.get("/external/status", getStatus);
router.get("/external/user-stats", getUserStats);
router.get("/external/user-contexts", getUserContexts);
router.get("/external/user-contexts/:id/entries", getContextEntries);
router.delete("/external/user-contexts/:id", deleteContext);
router.post("/external/user-contexts/batch-delete", batchDeleteContexts);
router.post("/external/deep-sync", deepSync);
router.post("/external/save-relayed-content", saveRelayedContentId);
router.get("/external/user-contexts/:id/relayed-contents", getRelayedContents);

module.exports = router;
