const express = require("express");
const router = express.Router();

const {
  createCoupon,
  getAvailableCoupons,
  getCouponById,
} = require("../controllers/couponControllers");

router.post("/createCoupon", createCoupon);
router.get("/getAvailableCoupons", getAvailableCoupons);
router.get("/getCouponById", getCouponById);

module.exports = router;