const { StatusCodes } = require('http-status-codes');
const Razorpay = require('razorpay');
const {
  fetchEventData,
  fetchCouponById,
  verifyTicketPurchaseAccess,
} = require('./interServiceCalls');
const Award = require("../models/award");
const Layout = require("../models/layout");
const {
  verifySeatLocks,
  lockSeats,
  unLockSeats,
  extractAvailableSeatsFromLayout,
} = require("../utils/seatUtils");

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

function buildTicketAccessMap(ticketAccess = [], fallbackType = null, privateCode = null) {
  const accessMap = {};

  if (Array.isArray(ticketAccess)) {
    ticketAccess.forEach((entry) => {
      const type = String(entry?.type || "").trim();
      if (!type) {
        return;
      }

      accessMap[type] = String(entry?.privateCode || "").trim();
    });
  }

  if (fallbackType && privateCode && !accessMap[fallbackType]) {
    accessMap[fallbackType] = String(privateCode).trim();
  }

  return accessMap;
}

async function validateTicketPurchaseAccess({
  eventId,
  types = [],
  userId,
  uid,
  privateCode,
  ticketAccess,
}) {
  const uniqueTypes = [...new Set((types || []).filter(Boolean))];
  const accessMap = buildTicketAccessMap(
    ticketAccess,
    uniqueTypes.length === 1 ? uniqueTypes[0] : null,
    privateCode,
  );

  for (const ticketType of uniqueTypes) {
    const result = await verifyTicketPurchaseAccess({
      eventId,
      ticketType,
      privateCode: accessMap[ticketType],
      uid,
      userId,
    });

    if (!result?.canBuy) {
      return {
        success: false,
        error: result?.message || `You are not allowed to buy ${ticketType}.`,
      };
    }
  }

  return { success: true, error: null };
}

async function checkAmountValidityAndAvailability({
  eventId,
  types,
  couponId,
  amount,
  userId,
  seats,
  uid,
  privateCode,
  ticketAccess,
}) {
  try {
    const accessCheck = await validateTicketPurchaseAccess({
      eventId,
      types,
      userId,
      uid,
      privateCode,
      ticketAccess,
    });

    if (!accessCheck.success) {
      return {
        success: false,
        error: accessCheck.error,
        breakdown: null,
      };
    }

    const eventData = await fetchEventData({
      id: eventId,
      fields: [
        "ticketTypes",
        "platformFeeEnabled",
        "platformFee",
        "belongsTo",
        "status",
        "seatsBooked",
        "layoutId",
      ],
    });

    if (!eventData) {
      return { success: false, error: "Event not found", breakdown: null };
    }

    if (eventData.status !== "featured") {
      return {
        success: false,
        error: "Event is expired or coming soon!",
        breakdown: null,
      };
    }

    const seatIds = seats?.flatMap((seatGroup) => seatGroup.seatIds || []) || [];

    if (seatIds.length > 6) {
      return {
        success: false,
        error: "You can book maximum 6 seats at a time",
        breakdown: null,
      };
    }

    const layout = eventData.layoutId
      ? await Layout.findById(eventData.layoutId)
      : null;

    if (seatIds.length > 0) {
      const canBookSeats = await verifySeatLocks(seatIds, eventId, userId);
      if (!canBookSeats) {
        return {
          success: false,
          error: "Seats are not available or not locked by you",
          breakdown: null,
        };
      }
    }

    if (layout && Array.isArray(seats) && seats.length > 0) {
      for (const ticketGroup of seats) {
        const matchedType = eventData.ticketTypes?.find(
          (ticketType) =>
            ticketType.type === ticketGroup.type ||
            ticketType._id?.toString() === ticketGroup.type?.toString(),
        );

        const validSeatsForType = extractAvailableSeatsFromLayout(
          layout,
          [],
          new Set(),
          matchedType?._id?.toString(),
        );

        const validSeatIdsForType = new Set(
          validSeatsForType.map((seat) => seat.seatId),
        );

        const wrongSeats = (ticketGroup.seatIds || []).filter(
          (seatId) => !validSeatIdsForType.has(seatId),
        );

        if (wrongSeats.length > 0) {
          return {
            success: false,
            error: `Seats ${wrongSeats.join(", ")} do not belong to ticket type "${ticketGroup.type}".`,
            breakdown: null,
          };
        }
      }
    }

    const bookedSeatsSet = new Set(eventData.seatsBooked || []);
    let ticketSubtotal = 0;

    for (const type of types) {
      const selectedTicket = eventData.ticketTypes.find(
        (ticketType) =>
          ticketType.type === type ||
          ticketType._id?.toString() === type?.toString(),
      );

      if (!selectedTicket) {
        return {
          success: false,
          error: `Ticket type "${type}" not found`,
          breakdown: null,
        };
      }

      const selectedSeats =
        seats?.find(
          (seatGroup) =>
            seatGroup.type === type ||
            seatGroup.type?.toString() === selectedTicket._id?.toString(),
        )?.seatIds || [];

      for (const seatId of selectedSeats) {
        if (bookedSeatsSet.has(seatId)) {
          return {
            success: false,
            error: `Seat ${seatId} is already booked`,
            breakdown: null,
          };
        }
      }

      ticketSubtotal += selectedSeats.length > 0
        ? selectedSeats.length * (Number(selectedTicket.price) || 0)
        : Number(selectedTicket.price) || 0;
    }

    if (isNaN(ticketSubtotal)) {
      return {
        success: false,
        error: "Amount mismatch",
        breakdown: null,
      };
    }

    let coupon = null;
    if (couponId) {
      coupon = await fetchCouponById({ couponId, eventId, userId });
    }

    const feePercent = eventData.platformFeeEnabled
      ? Number(eventData.platformFee) || 2.5
      : 0;

    const breakdown = buildDiscountedBreakdown({
      ticketPrice: ticketSubtotal,
      feePercent,
      coupon,
    });

    const pricing = {
      baseAmountRupees: roundCurrency(ticketSubtotal),
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

    return {
      success: pricing.finalChargeRupees === Number(amount),
      error: null,
      breakdown: pricing,
    };
  } catch (error) {
    console.error("checkAmountValidityAndAvailability error:", error);
    return {
      success: false,
      error: "Internal error during amount validation",
      breakdown: null,
    };
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
    const {
      amount,
      productName,
      description,
      notes,
      couponId,
      seats,
      uid,
      universeMetaData,
      privateCode,
      ticketAccess,
    } = req.body;

    const safeUserId = req.user.id;

    if (notes && !notes.userId) {
      notes.userId = safeUserId;
    }

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

    const ticketTypes = notes.types || (notes.type ? [notes.type] : []);

    const { success, breakdown, error } = await checkAmountValidityAndAvailability({
      amount: amountNum,
      eventId: notes.eventId,
      types: ticketTypes,
      userId: notes.userId,
      couponId,
      seats,
      uid: uid || req.user.uid,
      privateCode,
      ticketAccess,
    });

    console.log("valid", success);

    if (!success || !breakdown) {
      console.log(3);
      return res.status(400).json({
        success: false,
        message: error || "Amount mismatch",
      });
    }

    let seatIdsToLock = [];
    if (Array.isArray(seats)) {
      seatIdsToLock = seats.flatMap((seatGroup) => seatGroup.seatIds || []);
    }

    await lockSeats(seatIdsToLock, notes.eventId, notes.userId);

    // Build safe notes
    const safeNotes = {
      eventId: notes.eventId,
      userId: notes.userId,
      amtPaid: notes.amtPaid,
      types: ticketTypes,
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
      privateCode,
      ticketAccess,
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
        unLockSeats(seatIdsToLock, notes.eventId, notes.userId);
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
