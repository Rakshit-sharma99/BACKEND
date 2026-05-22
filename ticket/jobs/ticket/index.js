const mongoose = require("mongoose");
const Ticket = require("../../models/ticket");
const { sendKafkaMessage } = require('../../config/utils/sendKafkaMessage');

module.exports = async function createTicketForEvent({ payment, session }) {
  if (!session) throw new Error("Session required");
  const notes = payment.notes || {};
  const { amtPaid, eventId, extraFieldsData, type, userId, couponId } = notes;

  // input validation
  if (!mongoose.Types.ObjectId.isValid(userId))
    throw new Error("Invalid userId");
  if (!mongoose.Types.ObjectId.isValid(eventId))
    throw new Error("Invalid eventId");

  const amount = Number(amtPaid) || 0;

  const ticketDoc = {
    eventId,
    paymentId: payment.id,
    amtPaid: amount,
    boughtBy: userId,
    generatedAt: new Date(),
    type,
    extraFieldsData,
  };

  // Try to create, handle duplicate key as idempotent
  try {
    const [ticket] = await Ticket.create([ticketDoc], { session });

    // update user and event
    await Promise.all([
      sendKafkaMessage("ADD_TICKET_TO_USER", "universe", {
        userId,
        ticketId: ticket._id,
      }),
      sendKafkaMessage("ADD_TICKET_TO_EVENT", "event", {
        eventId,
        ticketId: ticket._id,
      }),
    ]);

    if (couponId) {
      await sendKafkaMessage("UPDATE_COUPON", "coupon", {
        couponId,
        userId,
        eventId,
      });
    }

    return ticket;
  } catch (err) {
    if (err && err.code === 11000) {
      // duplicate key — another process already processed it: treat as success
      console.warn("Duplicate ticket create ignored for payment:", payment.id);
      return;
    }
    throw err; // rethrow so outer worker aborts transaction and Bull retries
  }
};
