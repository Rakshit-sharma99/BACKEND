const Event = require("../../../models/event");
const mongoose = require("mongoose");

// Main Kafka-triggered handler
const add_ticket_to_event = async (messageValue) => {
    try {
        const data = JSON.parse(messageValue);
        const { eventId, ticketId } = data;

        if (!eventId || !ticketId) {
            console.warn("⚠️ Missing required fields in message:", data);
            return;
        }

        // Add ticket reference to event
        await Event.findByIdAndUpdate(eventId, {
            $push: { bookedBy: new mongoose.Types.ObjectId(ticketId) },
        });

    } catch (error) {
        console.error("❌ Failed to process ticket-event schema:", error);
    }
};


module.exports = { add_ticket_to_event };
