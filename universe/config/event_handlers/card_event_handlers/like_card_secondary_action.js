const User = require("../../../models/user");
const { scheduleNotification2 } = require("../../../controllers/utils");

const like_card_secondary_action = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const { creatorId, cardInfo, userInfo, cardId } = data;

    if (!creatorId || !cardInfo || !userInfo || !cardId) {
      console.warn("Missing essential data in message payload");
      return;
    }

    const contributorInfo = await User.findById(creatorId, {
      pushToken: 1,
      unreadNotice: 1,
    });

    if (!contributorInfo) {
      console.error(`Contributor with ID ${creatorId} not found.`);
      return;
    }

    const cardObj = cardInfo.toObject ? cardInfo.toObject() : cardInfo;
    const noticeId = `like_${cardId}`;

    // Optional: Remove existing notice with same UID to prevent duplicates
    contributorInfo.unreadNotice = contributorInfo.unreadNotice.filter(
      (n) => n.uid !== noticeId
    );

    const notice = {
      value: `${userInfo.name} liked your card!`,
      img1: userInfo.image || "",
      img2: "",
      action: "profile2",
      key: "likedACard",
      params: {
        img: userInfo.image,
        name: userInfo.name,
        id: userInfo._id,
        userPushToken: userInfo.pushToken,
        uid: userInfo.uid,
        universeMetaData: userInfo.universeMetaData,
      },
      cardMetaData: {
        ...cardObj,
      },
      uid: noticeId,
    };

    contributorInfo.unreadNotice.unshift(notice);
    await contributorInfo.save();

    const trimmedText = (cardObj.value || "").trim();
    const notificationData = {
      pushToken: [contributorInfo.pushToken],
      title: `${userInfo.name} liked your card!`,
      body:
        trimmedText.length > 50
          ? `${trimmedText.substring(0, 50)}...`
          : trimmedText,
      url: `https://macbease.com/app/profile/${userInfo._id}`,
    };

    if (contributorInfo.pushToken) {
      scheduleNotification2(notificationData);
    }
  } catch (error) {
    console.error("❌ like_card_secondary_action failed", error);
  }
};

module.exports = { like_card_secondary_action };
