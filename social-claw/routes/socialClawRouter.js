const express = require("express");
const router = express.Router();

const whatsappRouter = require("./whatsappRouter");
const telegramRouter = require("./telegramRouter");
const discordRouter = require("./discordRouter");

const { searchMessages } = require("../controllers/searchController");
const { getStats } = require("../controllers/statsController");

// ── Platform sub-routers ──
router.use("/whatsapp", whatsappRouter);
router.use("/telegram", telegramRouter);
router.use("/discord", discordRouter);

// ── Cross-platform endpoints ──
router.post("/search", searchMessages);
router.get("/stats", getStats);

module.exports = router;
