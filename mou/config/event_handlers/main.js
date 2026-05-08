const prefix = process.env.KAFKA_CLIENT_ID;

// Kafka event handlers for the MOU service
// Add handlers here as inter-service messaging needs grow
const handlers = {
  // Example: listen for event creation to auto-create MOU drafts
  // [`${prefix}_create_mou_draft`]: createMouDraft,
};

module.exports = { handlers };
