const express = require("express");
const router = express.Router();

const {
  getReminders,
  interactWithReminder,
  addWatchlistItem,
  getWatchlist,
  removeWatchlistItem,
  updatePreferences,
  getEngagementProfile,
} = require("../controllers/reminderController");

const {
  createCampaign,
  getCampaigns,
  updateCampaign,
  getCampaignMetrics,
} = require("../controllers/campaignController");

const {
  getLiveStats,
  getLiveHistory,
} = require("../controllers/liveNotificationController");

// ── Reminder routes (user-facing) ──
router.get("/reminders", getReminders);
router.post("/reminders/:id/interact", interactWithReminder);

// ── Watchlist routes ──
router.post("/reminders/watchlist", addWatchlistItem);
router.get("/reminders/watchlist", getWatchlist);
router.delete("/reminders/watchlist/:id", removeWatchlistItem);

// ── Preferences ──
router.post("/reminders/preferences", updatePreferences);
router.get("/reminders/engagement", getEngagementProfile);

// ── Campaign routes (admin) ──
router.post("/campaigns", createCampaign);
router.get("/campaigns", getCampaigns);
router.patch("/campaigns/:id", updateCampaign);
router.get("/campaigns/:id/metrics", getCampaignMetrics);

// ── Live notification routes ──
router.get("/live/stats", getLiveStats);
router.get("/live/history", getLiveHistory);

module.exports = router;
