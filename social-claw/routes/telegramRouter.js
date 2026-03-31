const express = require("express");
const router = express.Router();

// ── Telegram Integration — Coming Soon ──

const comingSoon = (req, res) => {
  res.json({
    available: false,
    platform: "telegram",
    message: "Telegram integration coming soon 🚀",
  });
};

router.get("/status", comingSoon);
router.post("/connect", comingSoon);
router.post("/logout", comingSoon);
router.get("/communities", comingSoon);
router.get("/communities/selected", comingSoon);
router.post("/communities/select", comingSoon);
router.post("/search", comingSoon);

module.exports = router;
