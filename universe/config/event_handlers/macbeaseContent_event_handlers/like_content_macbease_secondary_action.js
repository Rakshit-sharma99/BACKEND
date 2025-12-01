const User = require("../../../models/user");
const {
  generateUri,
  scheduleNotification2,
} = require("../../../controllers/utils");

const like_content_macbease_secondary_action = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);

    const { publisherId, contentInfo, userInfo, contentId } = data;

    if (!publisherId || !contentInfo || !userInfo || !contentId) {
      console.warn("Missing essential data in message payload");
      return;
    }

    const contributorInfo = await User.findById(publisherId, {
      pushToken: 1,
      unreadNotice: 1,
      notifications: 1,
    });

    if (!contributorInfo) {
      console.error(`Contributor with ID ${publisherId} not found.`);
      return;
    }

    const contentObj = contentInfo.toObject
      ? contentInfo.toObject()
      : contentInfo;
    const likesCount = (contentObj.likes?.length || 1) - 1;
    const noticeId = `like_${contentId}`;

    let noticeText = `${userInfo.name} liked your post!`;
    if (likesCount === 1) {
      noticeText = `${userInfo.name} and 1 other liked your post!`;
    } else if (likesCount > 1) {
      noticeText = `${userInfo.name} and ${likesCount} others liked your post!`;
    }

    const notice = {
      value: noticeText,
      img1: userInfo.image || "",
      img2: contentObj.url || "",
      action: "profile2",
      key: "like",
      params: {
        img: userInfo.image,
        name: userInfo.name,
        id: userInfo._id,
        userPushToken: userInfo.pushToken,
      },
      contentMetaData: {
        ...contentObj,
        comments: (contentObj.comments || []).slice(0, 6),
        commentsNum: contentObj.comments?.length || 0,
      },
      uid: noticeId,
    };

    // Clean existing notices with same UID
    const unreadNotice = contributorInfo.unreadNotice.filter(
      (n) => n.uid !== noticeId
    );
    const notifications = contributorInfo.notifications.filter(
      (n) => n.uid !== noticeId
    );
    unreadNotice.unshift(notice);

    await User.updateOne({ _id: publisherId }, { unreadNotice, notifications });

    const trimmedText = (contentObj.text || "").trim();
    const notificationData = {
      pushToken: [contributorInfo.pushToken],
      title: `${userInfo.name} liked your post!`,
      body:
        trimmedText.length > 50
          ? `${trimmedText.substring(0, 50)}...`
          : trimmedText,
      url: `https://macbease.com/app/content/${contentId}/Macbease`,
    };

    if (contentObj.contentType === "image" && contentObj.url) {
      try {
        const img = await generateUri(contentObj.url.split("@")[0]);
        notificationData.image = img;
      } catch (imgErr) {
        console.warn("Failed to generate image URI", imgErr);
      }
    }

    scheduleNotification2(notificationData);
  } catch (error) {
    console.error("❌ like_content_macbease_secondary_action failed", error);
  }
};

module.exports = { like_content_macbease_secondary_action };
