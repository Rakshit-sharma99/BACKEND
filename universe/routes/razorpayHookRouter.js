const express = require("express");
const router = express.Router();

const { razorpay_web_hook } = require("../controllers/razorpayHookControllers");

router.post("/webhook", razorpay_web_hook);

module.exports = router;
