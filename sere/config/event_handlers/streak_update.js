const { processEvent } = require("../../engine/rules");

/**
 * Handler for streak.update events
 * Triggers streak warning reminders
 */
const streak_update = async (messageValue) => {
  const data = JSON.parse(messageValue);
  console.log(`📥 SERE: received [streak.update]`, { userId: data.userId });
  await processEvent("streak.update", data);
};

module.exports = { streak_update };
