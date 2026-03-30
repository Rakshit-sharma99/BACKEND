const { processEvent } = require("../../engine/rules");

/**
 * Handler for user.activity events
 * Updates onboarding flags and last active timestamps
 */
const user_activity = async (messageValue) => {
  const data = JSON.parse(messageValue);
  console.log(`📥 SERE: received [user.activity]`, {
    userId: data.userId,
    activityType: data.activityType,
  });
  await processEvent("user.activity", data);
};

module.exports = { user_activity };
