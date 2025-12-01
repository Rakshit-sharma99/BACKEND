const User = require("../../../models/user");

const person_tag_macbease = async (messageValue) => {
  try {
    const data = JSON.parse(messageValue);
    const taggedUser = await User.findById(data.taggedUser, {
      taggedContents: 1,
      unreadNotice: 1,
    });
    const notice = {
      value: `${data.sender.name} tagged you in his post!`,
      img1: data.sender.image,
      img2: data.processedUrl,
      expandType: "Macbease",
      expandData: {
        ...data.content,
      },
      key: "tag",
      time: new Date(),
      uid: `${new Date().toDateString()}/${data.taggedUser}/${
        data.content._id
      }`,
    };
    taggedUser.taggedContents = [
      ...taggedUser.taggedContents,
      { type: "macbease", contentId: data.content._id },
    ];
    taggedUser.unreadNotice = [notice, ...taggedUser.unreadNotice];
    await taggedUser.save();
    console.log("📩 Successfully processed person tagged for macbease topic");
  } catch (error) {
    console.log(error);
    console.log("📩 Failed to process person tagged for macbease topic");
  }
};

module.exports = { person_tag_macbease };
