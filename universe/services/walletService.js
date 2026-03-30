const mongoose = require("mongoose");
const Wallet = require("../models/wallet");
const WalletTransaction = require("../models/walletTransaction");

/**
 * Get or create a wallet for the given club.
 * Used by the Kafka event handler for ticket sale credits.
 */
async function getOrCreateWallet(clubId, session = null) {
  const options = {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  };

  if (session) {
    options.session = session;
  }

  return Wallet.findOneAndUpdate(
    { clubId },
    { $setOnInsert: { clubId } },
    options,
  );
}

/**
 * Credit a ticket sale into the club wallet.
 * Called by the credit_ticket_sale Kafka event handler.
 * Runs inside a MongoDB transaction with idempotency on razorpayPaymentId.
 */
async function creditTicketSale(messagePayload) {
  const {
    clubId,
    eventId,
    eventName,
    ticketId,
    paymentId,
    grossChargePaise,
    platformFeePaise,
    clubNetCreditPaise,
    currency = "INR",
    ticketType,
    userId,
    couponId = null,
  } = messagePayload || {};

  if (!mongoose.Types.ObjectId.isValid(clubId)) {
    console.log("Wallet credit skipped: invalid clubId.");
    return { skipped: true };
  }

  const creditAmount = Number(clubNetCreditPaise);
  if (!Number.isInteger(creditAmount) || creditAmount <= 0) {
    console.log("Wallet credit skipped because clubNetCreditPaise is not positive.");
    return { skipped: true };
  }

  const existing = await WalletTransaction.findOne({
    razorpayPaymentId: paymentId,
  }).lean();
  if (existing) {
    return { skipped: true, duplicate: true };
  }

  const session = await mongoose.startSession();
  let result = null;

  try {
    await session.withTransaction(async () => {
      const wallet = await getOrCreateWallet(clubId, session);

      const duplicate = await WalletTransaction.findOne({
        razorpayPaymentId: paymentId,
      }).session(session);
      if (duplicate) {
        result = { skipped: true, duplicate: true };
        return;
      }

      const updatedWallet = await Wallet.findByIdAndUpdate(
        wallet._id,
        {
          $inc: {
            availableBalancePaise: creditAmount,
          },
        },
        {
          new: true,
          session,
        },
      );

      const [transaction] = await WalletTransaction.create(
        [
          {
            walletId: updatedWallet._id,
            clubId,
            direction: "CREDIT",
            category: "TICKET_SALE",
            entryKind: "CREDIT_APPLIED",
            amountPaise: creditAmount,
            currency,
            sourceType: "RAZORPAY_PAYMENT",
            sourceId: ticketId || paymentId,
            razorpayPaymentId: paymentId,
            idempotencyKey: `ticket_sale_${paymentId}`,
            relatedEntityId: eventId || null,
            metadata: {
              label: eventName
                ? `Ticket sales for ${eventName}`
                : "Ticket sale credit",
              eventName: eventName || null,
              ticketType: ticketType || null,
              userId: userId || null,
              ticketId: ticketId || null,
              couponId,
            },
            pricingSnapshot: {
              grossChargePaise: Number(grossChargePaise) || 0,
              platformFeePaise: Number(platformFeePaise) || 0,
              clubNetCreditPaise: creditAmount,
            },
            createdBy: {
              service: "ticket",
              trigger: "payment.captured",
            },
          },
        ],
        { session },
      );

      result = {
        skipped: false,
        walletId: updatedWallet._id,
        availableBalancePaise: updatedWallet.availableBalancePaise,
        transactionId: transaction._id,
      };
    });
  } finally {
    await session.endSession();
  }

  return result;
}

module.exports = {
  creditTicketSale,
};
