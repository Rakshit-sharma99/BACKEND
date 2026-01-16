const User = require("../../../models/user");
const mongoose = require("mongoose");

// Main Kafka-triggered handler
const add_ticket_to_user = async (messageValue) => {
    try {
        const data = JSON.parse(messageValue);
        const { userId, ticketId } = data;


        await User.findByIdAndUpdate(userId, {
            $push: {
                ticketsBought: {
                    $each: [new mongoose.Types.ObjectId(ticketId)],
                    $position: 0,
                },
            },
        });

    } catch (error) {
        console.error("❌ Failed to process ticket assignment:", error);
    }
};

module.exports = { add_ticket_to_user };
