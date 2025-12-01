const schedule = require("node-schedule");

const User = require("../../../models/user");
const {scheduleNotification2} = require("../../../controllers/utils");

const create_offer = async (messageValue) => {

  try {
    const { offerId,jobTime,visibleTo,dispatchCustomNotification,notificationMetaData } = JSON.parse(messageValue);
     schedule.scheduleJob(
          `offer_creation_${offerId}`,
          jobTime,
          async () => {
            try {
              const users = await User.find({ _id: { $in: visibleTo } }).select(
                "pushToken"
              );

              const pushTokens = users
                .map((user) => user.pushToken)
                .filter(Boolean);
              if (pushTokens.length > 0) {
                const notificationPayload = dispatchCustomNotification
                  ? {
                      pushToken: pushTokens,
                      title: notificationMetaData.noticeTitle,
                      body: notificationMetaData.noticeBody,
                      image: notificationMetaData.noticeImage,
                      url: `https://macbease.com/app/ip`,
                    }
                  : {
                      pushToken: pushTokens,
                      title: "Hey there!",
                      body: "We have got a new offer for you. Tap to view.",
                      url: `https://macbease.com/app/ip`,
                    };
                scheduleNotification2(notificationPayload);
              }
            } catch (error) {
              console.error(
                `Failed to send scheduled notification for offer ${offerId}:`,
                error
              );
            }
          }
        );
  } catch (error) {
    console.error("❌ Failed to process create offer topic:", error);
  }
};

module.exports = { create_offer };
