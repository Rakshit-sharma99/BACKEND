const express = require("express");
const router = express.Router();

const {
  createCoupon,
  getAvailableCoupons,
} = require("../controllers/couponControllers");

router.post("/createCoupon", createCoupon);
router.get("/getAvailableCoupons", getAvailableCoupons);

module.exports = router;