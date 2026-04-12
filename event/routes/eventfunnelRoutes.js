const express = require("express");
const router = express.Router();

const {
    getEventTrends,
    ticketsPerformance
} = require("../controllers/eventfunnelControllers")

router.get("/getEventTrends",getEventTrends)
router.get("/ticketsPerformance",ticketsPerformance)
module.exports = router;
