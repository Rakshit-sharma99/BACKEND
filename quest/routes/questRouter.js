const express = require("express");
const router = express.Router();

const { insertNewFields, createQuest, findValidQuests, fetchQuests } = require("../controllers/questControllers");

router.post("/createQuest", createQuest);
router.get("/findValidQuests", findValidQuests);
router.get("/fetchQuests",fetchQuests);
router.post("/insertNewFields",insertNewFields)

module.exports = router;
