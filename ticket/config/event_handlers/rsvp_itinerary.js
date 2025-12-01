const Ticket = require("../../models/ticket");

const rsvp_itinerary = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { itineraryId, ticketId } = data;

    if (!itineraryId || !ticketId) {
      console.warn("⚠️ Missing itineraryId or ticketId in message");
      return;
    }

    const ticket = await Ticket.findById(ticketId, { rsvp: 1 });

    if (!ticket) {
      console.warn("⚠️ Ticket not found:", ticketId);
      return;
    }

    // Ensure rsvp array exists
    ticket.rsvp = ticket.rsvp || [];

    // Prevent duplicate entries
    if (!ticket.rsvp.includes(itineraryId)) {
      ticket.rsvp.push(itineraryId);
      await ticket.save();
    } else {
      console.log("ℹ️ Itinerary already RSVP’d.");
    }
  } catch (error) {
    console.error("❌ Failed to process add itinerary topic:", error);
  }
};

module.exports = { rsvp_itinerary };
