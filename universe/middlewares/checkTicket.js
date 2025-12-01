const User = require("../models/user.js");
const Ticket = require("../models/ticket.js");

/**
 * Checks if a user has bought a ticket for a specific event.
 *
 * @async
 * @param {string} userId - The ID of the user.
 * @param {string} eventId - The ID of the event.
 * @returns {Promise<boolean>} - A promise that resolves to true if the user has bought a ticket for the event, false otherwise.
 */

exports.checkTicketBought = async (userId, eventId) => {
    try {
        const user = await User.findById(userId, { ticketsBought: 1 });
        
        if (!user || !user.ticketsBought || user.ticketsBought.length === 0) {
            return false;
        }
        
        const matchedTicket = await Ticket.findOne({
            _id: { $in: user.ticketsBought },
            eventId: eventId
        });
        
        return !!matchedTicket; 
    } catch (error) {
        console.error("Error checking ticket:", error);
        return false;
    }
};