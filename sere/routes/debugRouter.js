/**
 * Debug Router — SERE simulation & observability endpoints.
 *
 * Serves the debug dashboard UI and API endpoints.
 * All routes are prefixed with /sere/debug.
 */

const express = require("express");
const path = require("path");
const router = express.Router();

const {
  simulateFullPipeline,
  getUserEngagement,
  getProactiveMessages,
  simulateEligibility,
  simulateGenerateMessage,
  replayMessage,
  getTemplates,
  getConfig,
  cleanupDebugMessages,
} = require("../controllers/debugController");

// ── Dashboard UI ──
router.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../public/debug.html"));
});

// ── SSE Pipeline Simulation ──
router.post("/simulate/full-pipeline", simulateFullPipeline);

// ── Individual Stages ──
router.post("/simulate/eligibility", simulateEligibility);
router.post("/simulate/generate-message", simulateGenerateMessage);

// ── Data Inspection ──
router.get("/user-engagement/:userId", getUserEngagement);
router.get("/proactive-messages/:userId", getProactiveMessages);
router.get("/templates", getTemplates);
router.get("/config", getConfig);

// ── Replay & Cleanup ──
router.post("/replay/:proactiveMessageId", replayMessage);
router.delete("/proactive-messages/:userId", cleanupDebugMessages);

module.exports = router;
