const express = require("express")
const {
    getEventById,
    getTopEvents,
    getTopPastEvents,
} = require("../controllers/eventControllers");
const { updateFunnel } = require("../controllers/eventfunnelControllers");
const router = express.Router();

router.get("/getEventById", getEventById);
router.get("/getTopEvents", getTopEvents);
router.get("/getTopPastEvents", getTopPastEvents);
router.post("/updateFunnel", updateFunnel)

module.exports = router;