const { StatusCodes } = require('http-status-codes');
const Razorpay = require('razorpay');
const { fetchEventData, fetchCouponById } = require('./interServiceCalls');
const Award = require("../models/award");

//for stripe
const generatePaymentIntent = async (req, res) => {
  try {
    res.status(StatusCodes.OK).send('Stripe was decommisioned');
  } catch (e) {
    res.status(StatusCodes.OK).json({ error: e.message });
  }
};

/**
 * Validate ticket price and coupon against server data
 * @returns {boolean} true if amount matches, false otherwise
 */
function roundCurrency(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function buildDiscountedBreakdown({
  ticketPrice,
  feePercent,
  coupon,
}) {
  const baseAmount = Number(ticketPrice) || 0;
  const platformFee =
    feePercent > 0 ? roundCurrency((baseAmount * feePercent) / 100) : 0;
  const grossCharge = roundCurrency(baseAmount + platformFee);

  let finalCharge = grossCharge;

  if (coupon) {
    if (coupon.discountType === "flat") {
      finalCharge = roundCurrency(grossCharge - (Number(coupon.discountValue) || 0));
    } else if (coupon.discountType === "percentage") {
      finalCharge = roundCurrency(
        grossCharge - (grossCharge * (Number(coupon.discountValue) || 0)) / 100,
      );
    }
  }

  finalCharge = Math.max(0, finalCharge);

  if (grossCharge === 0) {
    return {
      grossChargeRupees: 0,
      platformFeeRupees: 0,
      clubNetCreditRupees: 0,
      finalChargeRupees: 0,
    };
  }

  const netPlatformFee = roundCurrency((platformFee / grossCharge) * finalCharge);
  const clubNetCredit = roundCurrency(finalCharge - netPlatformFee);

  return {
    grossChargeRupees: grossCharge,
    platformFeeRupees: netPlatformFee,
    clubNetCreditRupees: clubNetCredit,
    finalChargeRupees: finalCharge,
  };
}

async function getTicketPricingBreakdown({
  eventId,
  type,
  couponId,
  userId,
}) {
  try {
    const eventData = await fetchEventData({
      id: eventId,
      fields: ["ticketTypes", "platformFeeEnabled", "platformFee", "belongsTo"],
    });
    if (!eventData) return null;

    const selectedTicket = eventData.ticketTypes.find((t) => t.type === type);
    if (!selectedTicket) return null;

    const baseAmount = Number(selectedTicket.price);
    if (isNaN(baseAmount)) return null;

    let coupon = null;
    if (couponId) {
      coupon = await fetchCouponById({ couponId, eventId, userId });
    }

    const feePercent = eventData.platformFeeEnabled
      ? Number(eventData.platformFee) || 2.5
      : 0;

    const breakdown = buildDiscountedBreakdown({
      ticketPrice: baseAmount,
      feePercent,
      coupon,
    });

    return {
      baseAmountRupees: roundCurrency(baseAmount),
      grossChargeRupees: breakdown.grossChargeRupees,
      finalChargeRupees: breakdown.finalChargeRupees,
      platformFeeRupees: breakdown.platformFeeRupees,
      clubNetCreditRupees: breakdown.clubNetCreditRupees,
      grossChargePaise: Math.round(breakdown.grossChargeRupees * 100),
      chargedAmountPaise: Math.round(breakdown.finalChargeRupees * 100),
      platformFeePaise: Math.round(breakdown.platformFeeRupees * 100),
      clubNetCreditPaise: Math.round(breakdown.clubNetCreditRupees * 100),
      feePercent,
      clubId: eventData?.belongsTo?.id || null,
      belongsToType: eventData?.belongsTo?.type || null,
    };
  } catch (error) {
    console.error("getTicketPricingBreakdown error:", error);
    return null;
  }
}

async function checkAmountValidity({
  eventId,
  type,
  couponId,
  amount,
  userId,
}) {
  const breakdown = await getTicketPricingBreakdown({
    eventId,
    type,
    couponId,
    userId,
  });

  if (!breakdown) return { isValid: false, breakdown: null };

  return {
    isValid: breakdown.finalChargeRupees === Number(amount),
    breakdown,
  };
}

/**
 * Validate certificate and badge price against server data
 * @returns {boolean} true if amount matches, false otherwise
 */
async function checkAmountValidityForAwards({ awardId, count, amount }) {
  try {
    const award = await Award.findById(awardId).lean();
    if (!award || typeof award.price !== "number") return false;

    const expectedAmount = award.price * count;
    return (
      Number(expectedAmount.toFixed(2)) === Number(Number(amount).toFixed(2))
    );
  } catch (error) {
    console.error("checkAmountValidity error:", error);
    return false;
  }
}

/**
 * Create Razorpay order for tickets
 */
const createOrder = async (req, res) => {
  const { RAZOR_PAY_KEY, RAZOR_PAY_SECRET } = process.env;
  const razorpayInstance = new Razorpay({
    key_id: RAZOR_PAY_KEY,
    key_secret: RAZOR_PAY_SECRET,
  });

  try {
    const { amount, productName, description, notes, couponId, uid, universeMetaData } = req.body;

    if (!notes || !notes.eventId || !notes.userId || !notes.amtPaid) {
      console.log(1);
      return res
        .status(400)
        .json({ success: false, msg: "Missing data! Try again" });
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      console.log(2);
      return res.status(400).json({ success: false, msg: "Invalid amount" });
    }

    const { isValid, breakdown } = await checkAmountValidity({
      amount: amountNum,
      eventId: notes.eventId,
      type: notes.type,
      userId: notes.userId,
      couponId,
    });

    console.log("valid", isValid);

    if (!isValid || !breakdown) {
      console.log(3);
      return res.status(400).json({ success: false, msg: "Amount mismatch" });
    }

    // Build safe notes
    const safeNotes = {
      eventId: notes.eventId,
      userId: notes.userId,
      amtPaid: notes.amtPaid,
      type: notes.type,
      extraFieldsData: notes.extraFieldsData,
      clubId: breakdown.clubId,
      belongsToType: breakdown.belongsToType,
      grossChargePaise: breakdown.grossChargePaise,
      chargedAmountPaise: breakdown.chargedAmountPaise,
      platformFeePaise: breakdown.platformFeePaise,
      clubNetCreditPaise: breakdown.clubNetCreditPaise,
      feePercent: breakdown.feePercent,
      uid,
      universeMetaData,
      ...(couponId && { couponId }), // include only if present

    };

    const options = {
      amount: Math.round(amountNum * 100), // convert to paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: safeNotes,
    };

    razorpayInstance.orders.create(options, (err, order) => {
      if (err) {
        console.error("Razorpay order error:", err);
        return res
          .status(500)
          .json({ success: false, msg: "Razorpay order creation failed" });
      }

      res.status(200).json({
        success: true,
        msg: "Order Created",
        order_id: order.id,
        amount: amountNum,
        product_name: productName,
        description,
      });
    });
  } catch (error) {
    console.error("createOrder error:", error);
    res.status(500).json({ success: false, msg: "Internal server error" });
  }
};

/**
 * Create Razorpay order for certificates and badges
 */
const createAwardsOrder = async (req, res) => {
  const { RAZOR_PAY_KEY, RAZOR_PAY_SECRET } = process.env;
  const razorpayInstance = new Razorpay({
    key_id: RAZOR_PAY_KEY,
    key_secret: RAZOR_PAY_SECRET,
  });

  try {
    const { amount, productName, description, notes } = req.body;

    if (!notes || !notes.awardId || !notes.count || !notes.clubId) {
      return res
        .status(400)
        .json({ success: false, msg: "Missing data! Try again" });
    }

    const amountNum = Number(amount);
    if (isNaN(amountNum) || amountNum <= 0) {
      return res.status(400).json({ success: false, msg: "Invalid amount" });
    }

    const isValidAmount = await checkAmountValidityForAwards({
      amount,
      awardId: notes.awardId,
      count: notes.count,
    });

    if (!isValidAmount) {
      return res.status(400).json({ success: false, msg: "Amount mismatch" });
    }

    // Build safe notes
    const safeNotes = {
      clubId: notes.clubId,
      awardId: notes.awardId,
      count: notes.count,
    };

    const options = {
      amount: Math.round(amountNum * 100), // convert to paise
      currency: "INR",
      receipt: `rcpt_${Date.now()}`,
      notes: safeNotes,
    };

    razorpayInstance.orders.create(options, (err, order) => {
      if (err) {
        console.error("Razorpay order error:", err);
        return res
          .status(500)
          .json({ success: false, msg: "Razorpay order creation failed" });
      }

      res.status(200).json({
        success: true,
        msg: "Order Created",
        order_id: order.id,
        amount: amountNum,
        product_name: productName,
        description,
      });
    });
  } catch (error) {
    console.error("createOrder error:", error);
    res.status(500).json({ success: false, msg: "Internal server error" });
  }
};

module.exports = { generatePaymentIntent, createOrder,createAwardsOrder };
