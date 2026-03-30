const express = require("express");
const router = express.Router();

const {
  getNextQuestion,
  seedQuestions,
  getStats,
  listQuestions,
} = require("../controllers/questionController");

const {
  learnFromChat,
  approveQuestion,
  retireQuestion,
} = require("../controllers/questionLearningController");

// Question engine
router.get("/next", getNextQuestion);
router.get("/stats", getStats);
router.get("/list", listQuestions);

// Seeding & admin
router.post("/seed", seedQuestions);
router.post("/approve", approveQuestion);
router.post("/retire", retireQuestion);

// Learning (can also be triggered via Kafka)
router.post("/learn", learnFromChat);

module.exports = router;
