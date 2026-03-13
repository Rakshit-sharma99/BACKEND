const { creditTicketSale } = require("../../../services/walletService");

const credit_ticket_sale = async (messageValue) => {
  try {
    const payload =
      typeof messageValue === "string" ? JSON.parse(messageValue) : messageValue;

    const result = await creditTicketSale(payload);
    console.log("Wallet ticket sale credit result:", result);
  } catch (error) {
    console.error("Failed to credit ticket sale into wallet:", error);
    throw error;
  }
};

module.exports = { credit_ticket_sale };
