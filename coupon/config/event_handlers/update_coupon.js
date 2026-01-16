const mongoose = require("mongoose");
const Coupon = require("../../models/coupon");

// Main Kafka-triggered handler
const update_coupon = async (messageValue) => {
    try {
        const data = JSON.parse(messageValue);
        const { userId, couponId } = data;


        await Coupon.findOneAndUpdate(
            { _id: couponId, isActive: true, usedBy: { $ne: userId } },
            { $addToSet: { usedBy: userId } }
        );

    } catch (error) {
        console.error("❌ Failed to process update coupon:", error);
    }
};

module.exports = { update_coupon };
