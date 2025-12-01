const Refund = require("../../models/refunds");

const create_refund = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { paymentId, eventId, userId, amtPaid, refundStatus } = data;

    if (!paymentId || !eventId || !userId || amtPaid == null) {
      throw new Error("Missing required refund data");
    }

    await Refund.create({
      paymentId,
      eventId,
      userId,
      amtRefunded: amtPaid,
      refundStatus,
      refundTransactionId: null, // Correct key name
    });
  } catch (error) {
    console.error("❌ Failed to process create_refund schema:", error);
  }
};

module.exports = { create_refund };
