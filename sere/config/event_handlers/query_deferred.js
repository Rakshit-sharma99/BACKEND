const { processEvent } = require("../../engine/rules");

/**
 * Handler for query.deferred events
 * Stores unanswered queries for later notification
 */
const query_deferred = async (messageValue) => {
  const data = JSON.parse(messageValue);
  console.log(`📥 SERE: received [query.deferred]`, { userId: data.userId });
  await processEvent("query.deferred", data);
};

module.exports = { query_deferred };
