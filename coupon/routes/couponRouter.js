const express = require("express");
const router = express.Router();

const {
  createCoupon,
  getAvailableCoupons,
  getCouponById,
  isValidCoupon,
} = require("../controllers/couponControllers");

router.post("/createCoupon", createCoupon);
router.get("/getAvailableCoupons", getAvailableCoupons);
router.get("/getCouponById", getCouponById);
router.get("/isValidCoupon", isValidCoupon);

module.exports = router;
