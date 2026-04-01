const express = require("express");
const router = express.Router();

const { sendPush } = require("../controllers/pushController");

// POST /universe/api/v1/push/send — internal push notification endpoint
router.post("/send", sendPush);

module.exports = router;
