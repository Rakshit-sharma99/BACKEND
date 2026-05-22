const { redeemCouponForUser } = require("../../utils/couponUtils");

// Main Kafka-triggered handler
const update_coupon = async (messageValue) => {
    try {
        const data = JSON.parse(messageValue);
        const { userId, couponId, eventId } = data;


        const updatedCoupon = await redeemCouponForUser({ couponId, eventId, userId });

        if (!updatedCoupon) {
            console.warn("Coupon update skipped: already used or invalid", { couponId, userId, eventId });
        }

    } catch (error) {
        console.error("❌ Failed to process update coupon:", error);
    }
};

module.exports = { update_coupon };
