const User = require("../../../models/user");
const { scheduleNotification2 } = require("../../../controllers/utils");

const resource_review_secondary_action = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { resourceId, publisherId, reviewerInfo, resourceInfo } = data;

    if (!publisherId || !resourceInfo || !reviewerInfo || !resourceId) {
      console.warn("Missing essential data in message payload");
      return;
    }

    const publisher = await User.findById(publisherId, {
      unreadNotice: 1,
      name: 1,
      pushToken: 1,
      image: 1,
    });

    if (!publisher) {
      console.error("Publisher not found.");
      return;
    }

    const notice = {
      value: `${reviewerInfo.name} reviewed your resource titled ${resourceInfo.title}`,
      img1: reviewerInfo.image,
      img2: publisher.image,
      key: "read",
      action: "profile2",
      params: {
        img: publisher.image,
        name: publisher.name,
        id: publisher._id,
        userPushToken: publisher.pushToken,
        active: "Resources",
      },
      time: new Date(),
      uid: `${new Date().toISOString()}/${resourceInfo._id}/${
        reviewerInfo._id
      }`,
    };

    publisher.unreadNotice = [notice, ...(publisher.unreadNotice || [])];
    await publisher.save();

    if (publisher.pushToken) {
      scheduleNotification2({
        pushToken: [publisher.pushToken],
        title: "Resource reviewed",
        body: `${reviewerInfo.name} reviewed your resource titled ${resourceInfo.title}`,
        url: `https://macbease.com/app/resources/${resourceInfo._id}`,
      });
    }
  } catch (error) {
    console.error("❌ resource_review_secondary_action failed", error);
  }
};

module.exports = { resource_review_secondary_action };
