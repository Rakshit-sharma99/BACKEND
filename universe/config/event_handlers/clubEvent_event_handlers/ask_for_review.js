const User = require('../../../models/user');

const ask_for_review = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { userId, eventName, eventPoster } = data;

    if (!userId || !eventName || !eventPoster) {
      console.warn('Missing essential data in message payload');
      return;
    }

    const notice = {
      value: `Share your experience at ${eventName} with us.`,
      img1: eventPoster,
      img2: eventPoster,
      key: 'event',
      action: 'yourTickets',
      params: {},
      time: new Date(),
      uid: `${new Date().toISOString()}/${eventName}/${userId}`,
    };

    await User.updateOne({ _id: userId }, { $push: { unreadNotice: notice } });
  } catch (error) {
    console.error('❌ ask_for_value failed', error);
  }
};

module.exports = { ask_for_review };
