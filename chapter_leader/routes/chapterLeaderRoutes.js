const express = require("express");
const router = express.Router();

const {

} = require("./controllers/chapterLeaderController");

router.post("/register", registerChapterLeader);
router.post("/login", loginChapterLeader);
router.get("/quests", getChapterLeaderQuests);
router.post("/update-progress", updateChapterLeaderProgress);
router.post("/claim-reward", claimChapterLeaderReward);

module.exports = router;