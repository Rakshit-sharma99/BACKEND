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
async function checkAmountValidity({
  eventId,
  type,
  couponId,
  amount,
  userId,
}) {
  try {
    const eventData = await fetchEventData({id:eventId,fields:["ticketTypes","platformFeeEnabled","platformFee"]})
    if (!eventData) return false;

    const selectedTicket = eventData.ticketTypes.find((t) => t.type === type);
    if (!selectedTicket) return false;

    let genuineAmount = Number(selectedTicket.price);
    if (isNaN(genuineAmount)) return false;

    // Apply platform fee
    if (eventData.platformFeeEnabled) {
      const feePercent = Number(eventData.platformFee) || 2.5;
      genuineAmount += (genuineAmount * feePercent) / 100;
    }

    // Apply coupon logic if provided
    if (couponId) {
      const coupon = await fetchCouponById({couponId,eventId,userId});

      if (coupon) {
        if (coupon.discountType === "flat") {
          genuineAmount -= Number(coupon.discountValue) || 0;
        } else if (coupon.discountType === "percentage") {
          genuineAmount -=
            (genuineAmount * (Number(coupon.discountValue) || 0)) / 100;
        }
      }
    }

    genuineAmount = Math.max(0, Math.ceil(genuineAmount));

    return genuineAmount === Number(amount);
  } catch (error) {
    console.error("checkAmountValidity error:", error);
    return false;
  }
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
    const { amount, productName, description, notes, couponId } = req.body;

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

    const isValidAmount = await checkAmountValidity({
      amount: amountNum,
      eventId: notes.eventId,
      type: notes.type,
      userId: notes.userId,
      couponId,
    });

    console.log("valid", isValidAmount);

    if (!isValidAmount) {
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
      ...(couponId && { couponId }), // include only if present
    };

    const options = {
      amount: amountNum * 100, // convert to paise
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
      amount: amountNum * 100, // convert to paise
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
