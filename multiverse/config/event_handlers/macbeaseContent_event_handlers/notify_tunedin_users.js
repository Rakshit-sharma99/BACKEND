const { generateUri, scheduleNotification2 } = require("../../../controllers/utils");
const User = require("../../../models/user");

const notify_tunedin_users = async (messageValue) => {
  try {
    const { tunedIn_By,contentMetaData,contributorMetaData } = JSON.parse(messageValue);

   let tokens = await User.find(
          { _id: { $in: tunedIn_By } },
          { pushToken: 1, _id: 0 }
        );
        tokens = tokens.map((item) => item.pushToken);
        if (contentMetaData.contentType === "image") {
          const img = await generateUri(contentMetaData.image.split("@")[0]);
          scheduleNotification2({
            pushToken: tokens,
            title: `Don't Miss Out! ${contributorMetaData.name} Just Posted Something New!`,
            body: `${contentMetaData.text.substring(0, 50)}...`,
            image: contentMetaData.image,
            url: `https://macbease.com/app/content/${contentMetaData.contentId}/Macbease`,
          });
        } else {
          scheduleNotification2({
            pushToken: tokens,
            title: `Don't Miss Out! ${contributorMetaData.name} Just Posted Something New!`,
            body: `${contentMetaData.text.substring(0, 50)}...`,
            url: `https://macbease.com/app/content/${contentMetaData.contentId}/Macbease`,
          });
        }

  } catch (err) {
    console.error("❌ Failed to process notify_tunedin_users message:", err);
  }
};

module.exports = { notify_tunedin_users };
