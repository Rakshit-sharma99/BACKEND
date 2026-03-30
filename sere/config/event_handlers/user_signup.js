const { processEvent } = require("../../engine/rules");

/**
 * Handler for user.signup events
 * Creates engagement profile for new users
 */
const user_signup = async (messageValue) => {
  const data = JSON.parse(messageValue);
  console.log(`📥 SERE: received [user.signup]`, { userId: data.userId });
  await processEvent("user.signup", data);
};

module.exports = { user_signup };
