const { processEvent } = require("../../engine/rules");

/**
 * Handler for answer.resolved events
 * Sends push notification when a deferred query is answered
 */
const answer_resolved = async (messageValue) => {
  const data = JSON.parse(messageValue);
  console.log(`📥 SERE: received [answer.resolved]`, { userId: data.userId });
  await processEvent("answer.resolved", data);
};

module.exports = { answer_resolved };
