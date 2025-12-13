const express = require("express");
const router = express.Router();

const {
  createCoupon,
  getAvailableCoupons,
  isValidCoupon,
} = require("../controllers/couponControllers");

router.post("/createCoupon", createCoupon);
router.get("/getAvailableCoupons", getAvailableCoupons);
router.get("/isValidCoupon", isValidCoupon);

module.exports = router;
