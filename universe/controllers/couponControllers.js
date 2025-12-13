const Coupon = require("../models/coupon");

// Create a new coupon
const createCoupon = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    const {
      code,
      discountType,
      discountValue,
      validForEvents,
      validForUsers,
      isPublic,
    } = req.body;

    // Basic validations
    if (!code || !discountType || !discountValue) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Create coupon
    const coupon = new Coupon({
      code,
      discountType,
      discountValue,
      validForEvents: validForEvents || [],
      validForUsers: validForUsers || [],
      usedBy: [],
      isPublic,
    });

    await coupon.save();

    return res.status(201).json({
      message: "Coupon created successfully",
      coupon,
    });
  } catch (err) {
    if (err.code === 11000) {
      // duplicate key error (unique code constraint)
      return res.status(400).json({ error: "Coupon code already exists" });
    }
    console.error("Error creating coupon:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

const getAvailableCoupons = async (req, res) => {
  try {
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(400).json({ error: "eventId is required" });
    }

    const userId = req.user.id;

    // Find coupons that match conditions
    const coupons = await Coupon.find(
      {
        isActive: true,
        $and: [
          {
            $or: [
              { validForEvents: { $exists: false } },
              { validForEvents: { $size: 0 } },
              { validForEvents: eventId },
            ],
          },
          {
            $or: [
              { validForUsers: { $exists: false } },
              { validForUsers: { $size: 0 } },
              { validForUsers: userId },
            ],
          },
        ],
        usedBy: { $ne: userId },
        isPublic: true,
      },
      { validForUsers: 0, usedBy: 0 }
    );

    return res.status(200).json({
      message: "Available coupons fetched successfully",
      coupons,
    });
  } catch (err) {
    console.error("Error fetching coupons:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

const isValidCoupon = async (req, res) => {
  try {
    const { eventId, couponCode } = req.query;

    console.log(eventId, couponCode);

    if (!eventId || !couponCode) {
      return res
        .status(400)
        .json({ error: "couponCode and eventId are required" });
    }

    const userId = req.user.id;

    const coupon = await Coupon.findOne(
      {
        code: couponCode,
        isActive: true,
        usedBy: { $ne: userId },
        $and: [
          {
            $or: [
              { validForEvents: { $exists: false } },
              { validForEvents: { $size: 0 } },
              { validForEvents: eventId },
            ],
          },
          {
            $or: [
              { validForUsers: { $exists: false } },
              { validForUsers: { $size: 0 } },
              { validForUsers: userId },
            ],
          },
        ],
      },
      { validForUsers: 0, usedBy: 0 }
    );

    if (!coupon) {
      return res.status(400).json({ error: "couponCode is invalid." });
    }

    return res.status(200).json({
      message: "Coupon is valid.",
      coupon,
    });
  } catch (error) {
    console.error("isValidCoupon error:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = { createCoupon, getAvailableCoupons, isValidCoupon };
