const express = require("express");
const router = express.Router();

const {
  getBalance,
  spend,
  refill,
  getHistory,
} = require("../controllers/creditController");

router.get("/balance", getBalance);
router.post("/spend", spend);
router.post("/refill", refill);
router.get("/history", getHistory);

module.exports = router;
