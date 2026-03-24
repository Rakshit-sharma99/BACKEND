const express = require("express");
const router  = express.Router();

const {
  createQuest,
  createMultipleQuest,
  getAllActiveQuests,
  getQuestsByIds,
} = require("../controllers/questControllers");

router.post("/createQuest",createQuest);
router.post("/createMultipleQuest", createMultipleQuest);

// Internal endpoints (called by universe service with internal JWT)
router.get("/getAllQuests",    getAllActiveQuests);
router.post("/getQuestsByIds", getQuestsByIds);

module.exports = router;