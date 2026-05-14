const express = require("express");
const router = express.Router();
const rateLimit = require("express-rate-limit");

const {
  syncContacts,
  revokeConsent,
  getSuggestions,
  actOnSuggestion,
} = require("../controllers/discoveryControllers");

// Rate limiter: max 5 syncs per day per user
const syncLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 5,
  keyGenerator: (req) => req.user?.id || req.ip,
  message: { error: "Too many sync requests. Try again tomorrow." },
  standardHeaders: true,
  legacyHeaders: false,
});

// POST   /discovery/api/v1/sync              — Sync hashed contacts + run matching
router.post("/sync", syncLimiter, syncContacts);

// DELETE /discovery/api/v1/sync              — Revoke consent, delete all data
router.delete("/sync", revokeConsent);

// GET    /discovery/api/v1/suggestions       — Get matched suggestions (paginated)
router.get("/suggestions", getSuggestions);

// POST   /discovery/api/v1/suggestions/:id   — Act on a suggestion
router.post("/suggestions/:suggestionId/action", actOnSuggestion);

module.exports = router;
