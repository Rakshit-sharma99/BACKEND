const express = require("express");
const router = express.Router();

const {
  createQuest,
  findValidQuests,
  fetchQuests,
} = require("../controllers/questControllers");

router.post("/createQuest", createQuest);
router.get("/findValidQuests", findValidQuests);
router.get("/fetchQuests",fetchQuests);

module.exports = router;
