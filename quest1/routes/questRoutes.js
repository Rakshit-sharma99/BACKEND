const express = require('express')
const router = express.Router();
const {
    createQuest,
    updateQuest,
    deleteQuest,
    getQuests,
    getQuestById
} = require("../controllers/questControllers");

router.post("/createQuest", createQuest);
router.get("/getQuests", getQuests);
router.get("/getQuestById/:id", getQuestById);
router.put("/updateQuest/:id", updateQuest);
router.delete("/deleteQuest/:id", deleteQuest);

module.exports = router;