const { StatusCodes } = require("http-status-codes");
const MacbeaseContent = require("../models/macbeaseContent");
const Project = require("../models/project");
const Admin = require("../models/admin");
const User = require("../models/user");
const schedule = require("node-schedule");
const mongoose = require("mongoose");
const {
  sendMail,
  scheduleNotification,
  scheduleNotification2,
  generateUri,
  pingAdmins,
} = require("../controllers/utils");

//Controller 1
const createContent = async (req, res) => {
  const {
    contentType,
    sendBy,
    url,
    text,
    key,
    peopleTagged = [],
    project,
  } = req.body;
  if (
    !contentType ||
    !sendBy ||
    (contentType !== "text" && !url) ||
    !text ||
    !peopleTagged
  ) {
    return res.status(StatusCodes.BAD_REQUEST).send("Incomplete data.");
  }
  const idOfSender = req.user.id;
  const timestamp = key === "normal" ? new Date() : key;

  try {
    const user = await User.findById(idOfSender, {
      name: 1,
      image: 1,
      pushToken: 1,
      macbeaseContentContribution: 1,
      tunedIn_By: 1,
    }).lean();

    if (!user) return res.status(StatusCodes.NOT_FOUND).send("User not found.");

    const params = {
      contributorName: user.name,
      contributorPic: user.image,
      userPushToken: user.pushToken,
    };

    const data = { ...req.body, idOfSender, timeStamp: timestamp, params };
    const content = await MacbeaseContent.create(data);

    if (project) {
      await Project.findByIdAndUpdate(
        project,
        { $addToSet: { media: content._id } },
        { new: true }
      );
    }

    if (peopleTagged.length !== 0) {
      const notifications = peopleTagged.map((taggedInfo) => ({
        value: `${user.name} tagged you in their post!`,
        img1: user.image,
        img2: url,
        expandType: "Macbease",
        expandData: { ...content._doc },
        key: "tag",
        time: new Date(),
        uid: `${new Date()}/${taggedInfo._id}/${idOfSender}`,
      }));

      const taggedUpdates = peopleTagged
        .map((taggedInfo) => {
          if (peopleTagged.type === "people") {
            return {
              updateOne: {
                filter: { _id: taggedInfo._id },
                update: {
                  $addToSet: {
                    taggedContents: {
                      type: "macbease",
                      contentId: content._id,
                    },
                  },
                  $push: {
                    unreadNotice: { $each: notifications, $position: 0 },
                  },
                },
              },
            };
          }
          return null;
        })
        .filter(Boolean);

      await User.bulkWrite(taggedUpdates);
    }
    await User.findByIdAndUpdate(idOfSender, {
      $push: {
        macbeaseContentContribution: { $each: [content._id], $position: 0 },
      },
    });

    const scheduleTime = new Date(Date.now() + 3 * 1000);
    schedule.scheduleJob(
      `macbeaseContent_${req.user.id}_${scheduleTime}`,
      scheduleTime,
      async () => {
        let tokens = await User.find(
          { _id: { $in: user.tunedIn_By } },
          { pushToken: 1, _id: 0 }
        );
        tokens = tokens.map((item) => item.pushToken);
        if (contentType === "image") {
          const img = await generateUri(url.split("@")[0]);
          scheduleNotification2({
            pushToken: tokens,
            title: `Don't Miss Out! ${user.name} Just Posted Something New!`,
            body: `${text.substring(0, 50)}...`,
            image: img,
            url: `https://macbease.com/app/content/${content._id}/Macbease`,
          });
        } else {
          scheduleNotification2({
            pushToken: tokens,
            title: `Don't Miss Out! ${user.name} Just Posted Something New!`,
            body: `${text.substring(0, 50)}...`,
            url: `https://macbease.com/app/content/${content._id}/Macbease`,
          });
        }
      }
    );

    return res.status(StatusCodes.OK).json({
      contentId: content._id,
      msg: "Content successfully created!",
    });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong!");
  }
};

//Controller 2
const likeContent = async (req, res) => {
  const { contentId, type, actionHandled } = req.body;
  const MAX_RETRIES = 3;
  let retryCount = 0;
  while (retryCount < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const userId = req.user.id;
      const [userInfo, contentInfo] = await Promise.all([
        User.findById(userId, {
          name: 1,
          image: 1,
          likedContents: 1,
          pushToken: 1,
        }).session(session),
        MacbeaseContent.findById(contentId).session(session),
      ]);
      const userAlreadyLiked = userInfo.likedContents.some(
        (item) => item.contentId.toString() === contentId
      );
      const contentAlreadyLiked = contentInfo.likes.includes(userId);

      if (!userAlreadyLiked) {
        userInfo.likedContents.push({ contentId, type });
      }

      if (!contentAlreadyLiked) {
        contentInfo.likes.push(userId);
      }

      if (!userAlreadyLiked || !contentAlreadyLiked) {
        await Promise.all([
          userInfo.save({ session }),
          contentInfo.save({ session }),
        ]);
      }

      await session.commitTransaction();

      if (!userAlreadyLiked || !contentAlreadyLiked) {
        secondaryActionsForLike(
          contentId,
          userId,
          contentInfo.idOfSender,
          userInfo,
          contentInfo
        );
      }
      return res
        .status(StatusCodes.OK)
        .send("You have successfully liked the content.");
    } catch (error) {
      await session.abortTransaction();
      console.log(error);
      if (error.hasErrorLabel("TransientTransactionError")) {
        retryCount++;
        console.log(`Retrying transaction... attempt ${retryCount}`);
      } else {
        console.log(error);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send("Something went wrong.");
      }
    }
  }
};

const secondaryActionsForLike = async (
  contentId,
  userId,
  publisherId,
  userInfo,
  contentInfo
) => {
  try {
    const scheduleTime = new Date(Date.now() + 1000);
    schedule.scheduleJob(
      `like_${contentId}_${userId}`,
      scheduleTime,
      async () => {
        const contributorInfo = await User.findById(publisherId, {
          pushToken: 1,
          unreadNotice: 1,
          notifications: 1,
        });
        if (!contributorInfo) {
          console.error(`Contributor with ID ${publisherId} not found.`);
          return;
        }
        const contentObj = contentInfo.toObject();
        const noticeId = `like_${contentId}`;
        let noticeText = "";
        if (contentObj.likes.length - 1 === 0) {
          noticeText = `${userInfo.name} liked your post!`;
        } else if (contentObj.likes.length - 1 === 1) {
          noticeText = `${userInfo.name} and 1 other liked your post!`;
        } else {
          noticeText = `${userInfo.name} and ${
            contentObj.likes.length - 1
          } others liked your post!`;
        }
        const notice = {
          value: noticeText,
          img1: `${userInfo.image}`,
          img2: `${contentInfo.url}`,
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
            comments: contentObj.comments.slice(0, 6),
            commentsNum: contentObj.comments.length,
          },
          uid: noticeId,
        };
        const { unreadNotice, notifications } = contributorInfo;
        const foundInUnread = unreadNotice.findIndex((n) => n.uid === noticeId);
        const foundInRead = notifications.findIndex((n) => n.uid === noticeId);
        if (foundInUnread !== -1) {
          unreadNotice.splice(foundInUnread, 1);
        } else if (foundInRead !== -1) {
          notifications.splice(foundInRead, 1);
        }
        unreadNotice.unshift(notice);
        await User.updateOne(
          { _id: publisherId },
          { unreadNotice, notifications }
        );
        const notificationData = {
          pushToken: [contributorInfo.pushToken],
          title: `${userInfo.name} liked your post!`,
          body: `${contentInfo.text.substring(0, 50)}...`,
          url: `https://macbease.com/app/content/${contentId}/Macbease`,
        };
        if (contentInfo.contentType === "image") {
          const img = await generateUri(contentInfo.url.split("@")[0]);
          notificationData.image = img;
        }
        scheduleNotification2(notificationData);
      }
    );
  } catch (error) {
    console.error("Error in secondary action after content liking", error);
  }
};

//Controller 3
const comment = async (req, res) => {
  const { contentId, type, text, peopleTagged, actionHandled } = req.body;
  if (!text) {
    return res.status(StatusCodes.BAD_REQUEST).send("Invalid comment.");
  }
  try {
    const [user, content] = await Promise.all([
      User.findById(req.user.id, {
        name: 1,
        image: 1,
        pushToken: 1,
        commentedContents: 1,
      }),
      MacbeaseContent.findById(contentId, {
        comments: 1,
        contentType: 1,
        url: 1,
        text: 1,
        idOfSender: 1,
      }),
    ]);
    if (!user || !content) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("User or content not found");
    }
    const { pushToken: contributorPushToken } = await User.findById(
      content.idOfSender,
      {
        pushToken: 1,
      }
    );
    const newComment = {
      cid: content.comments.length + 1,
      text,
      peopleTagged,
      likes: [],
      name: user.name,
      img: user.image,
      pushToken: user.pushToken,
      _id: user._id,
    };
    content.comments.unshift(newComment);
    user.commentedContents.unshift({ cid: newComment.cid, contentId, type });
    await Promise.all([content.save(), user.save()]);
    if (actionHandled) {
      if (content.contentType === "image") {
        const img = await generateUri(content.url.split("@")[0]);
        scheduleNotification2({
          pushToken: [contributorPushToken],
          title: `${user.name} commented on your post!`,
          body: `${content.text.substring(0, 50)}...`,
          image: img,
          url: `https://macbease.com/app/content/${contentId}/Macbease`,
        });
      } else {
        scheduleNotification2({
          pushToken: [contributorPushToken],
          title: `${user.name} commented on your post!`,
          body: `${content.text.substring(0, 50)}...`,
          url: `https://macbease.com/app/content/${contentId}/Macbease`,
        });
      }
    } else {
      if (content.contentType === "image") {
        const img = await generateUri(content.url.split("@")[0]);
        scheduleNotification(
          [contributorPushToken],
          `${user.name} commented on your post!`,
          `${content.text.substring(0, 50)}...`,
          img
        );
      } else {
        scheduleNotification(
          [contributorPushToken],
          `${user.name} commented on your post!`,
          `${content.text.substring(0, 50)}...`
        );
      }
    }
    return res.status(StatusCodes.OK).send("Comment posted successfully!");
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong!");
  }
};

//Controller 4
const unlikeContent = async (req, res) => {
  const { contentId } = req.body;
  const MAX_RETRIES = 3;
  let retryCount = 0;
  while (retryCount < MAX_RETRIES) {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
      const userId = req.user.id;
      const [userInfo, contentInfo] = await Promise.all([
        User.findById(userId, {
          likedContents: 1,
        }).session(session),
        MacbeaseContent.findById(contentId, {
          likes: 1,
        }).session(session),
      ]);
      userInfo.likedContents = userInfo.likedContents.filter(
        (item) => item.contentId !== contentId
      );
      contentInfo.likes = contentInfo.likes.filter(
        (item) => item !== req.user.id
      );
      await Promise.all([
        userInfo.save({ session }),
        contentInfo.save({ session }),
      ]);
      await session.commitTransaction();
      session.endSession();
      return res
        .status(StatusCodes.OK)
        .send("You have successfully unliked the content.");
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.log(error);
      if (error.hasErrorLabel("TransientTransactionError")) {
        retryCount++;
        console.log(`Retrying transaction... attempt ${retryCount}`);
      } else {
        console.log(error);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send("Something went wrong.");
      }
    }
  }
};

//Controller 5
const deleteContent = async (req, res) => {
  const { contentId, adminId } = req.body;
  if (req.user.role === "admin") isEligible = true;
  if (isEligible) {
    const deletedContent = await MacbeaseContent.findByIdAndDelete(contentId);
    Admin.findById(adminId, (err, admin) => {
      if (err) return console.error(err);
      admin.thrashUrls.push(deletedContent.url);
      admin.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send("The content has been successfully deleted.");
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send(
        "You are not authorized to delete this content as you are neither creator nor admin."
      );
  }
};

//Controller 6
const getContent = async (req, res) => {
  const { contentId } = req.query;
  try {
    const content = await MacbeaseContent.aggregate([
      {
        $match: { _id: mongoose.Types.ObjectId(contentId) },
      },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
    ]);
    if (content.length > 0) {
      return res.status(StatusCodes.OK).json(content[0]);
    } else {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Could not find the content.");
    }
  } catch (error) {
    console.error("Error fetching content:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error fetching content.");
  }
};

//Controller 7
const getComments = async (req, res) => {
  const { contentId, batch, batchSize, remainder } = req.query;
  let finalComments = [];
  try {
    const content = await MacbeaseContent.findById(contentId, {
      comments: 1,
      _id: 0,
    });
    if (batch && batchSize) {
      finalComments = content.comments.slice(
        (batch - 1) * batchSize,
        batch * batchSize
      );
      if (remainder) {
        finalComments.splice(0, remainder);
      }
    } else {
      finalComments = content.comments;
    }
    return res
      .status(StatusCodes.OK)
      .json({ finalComments, total: content.comments.length });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong!");
  }
};

const getPopularComments = async (req, res) => {
  const { contentId, batch } = req.query;
  try {
    const content = await MacbeaseContent.findById(contentId, { comments: 1 });
    let comments = content.comments;
    let popularComments = [];
    comments = comments.slice((batch - 1) * 100, batch * 100);
    if (comments.length < 6) {
      popularComments = comments;
    } else {
      for (let i = 0; i < 6; i++) {
        for (let j = i + 1; j < comments.length; j++) {
          let first = comments[i];
          let second = comments[j];
          if (first.likes.length < second.likes.length) {
            comments[i] = second;
            comments[j] = first;
          }
        }
      }
      popularComments = comments.slice(0, 6);
    }
    return res.status(StatusCodes.OK).json(popularComments);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

//Controller 8
const getContentBySpan = async (req, res) => {
  const { span } = req.query;
  let contents = await MacbeaseContent.find({});
  let length = contents.length;
  let date = new Date();
  let result = [];
  if (span === "today") {
    for (let i = 0; i < length; i++) {
      let content = contents[i];
      if (date - content.timeStamp < 86400000) {
        result.push(content);
      }
    }
  } else if (span === "week") {
    for (let i = 0; i < length; i++) {
      let content = contents[i];
      if (date - content.timeStamp < 604800000) {
        result.push(content);
      }
    }
  } else if (span === "all") {
    result = contents;
  }
  return res.status(StatusCodes.OK).json(result);
};

//Controller 9
const getLikeStatus = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { contentId } = req.query;
    const content = await MacbeaseContent.findById(contentId, {
      likes: 1,
      _id: 0,
    });
    let liked = content.likes.includes(req.user.id);
    return res.status(StatusCodes.OK).json({ liked });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to get the like status. ");
  }
};

//Controller 10
const getMacbeaseContribution = async (req, res) => {
  const { id, batch, batchSize } = req.query;
  const skip = (batch - 1) * batchSize;
  try {
    const user = await User.findById(id, {
      macbeaseContentContribution: { $slice: [skip, parseInt(batchSize)] },
    }).lean();
    if (!user || !user.macbeaseContentContribution) {
      return res.status(StatusCodes.OK).json([]);
    }
    const contents = await MacbeaseContent.aggregate([
      {
        $match: {
          _id: { $in: user.macbeaseContentContribution },
        },
      },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
      {
        $sort: { timeStamp: -1 },
      },
    ]);
    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error fetching contributions.");
  }
};

//Controller 11
const addToContentTeam = async (req, res) => {
  if (req.user.role === "admin") {
    try {
      const { id } = req.query;
      let user = await User.findById(id, { role: 1, email: 1, name: 1 });
      user.role = "Creator";
      user.save();
      //sending email to creator
      const name = user.name;
      const intro = [
        "We are so delighted to have you onboard Macbease Content Team.",
        `We look forward to having wonderful working experience with you.`,
      ];
      const outro = "Let us begin this journey together!";
      const subject = "Macbease Confirmation";
      const destination = [user.email];
      const { ses, params } = await sendMail(
        name,
        intro,
        outro,
        subject,
        destination
      );
      ses.sendEmail(params, function (err, data) {
        if (err) {
          console.log(err, err.stack);
        }
      });
      return res
        .status(StatusCodes.OK)
        .send("Successfully added to Macbease content team!");
    } catch (error) {
      console.log(error.message);
      return res.status(StatusCodes.OK).send("Something went wrong.");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to add to content team.");
  }
};

//Controller 12
const readContentTeam = async (req, res) => {
  if (req.user.role === "admin") {
    const users = await User.find(
      { role: "Creator" },
      {
        name: 1,
        image: 1,
        course: 1,
        email: 1,
        _id: 1,
        reg: 1,
        pushToken: 1,
        interests: 1,
      }
    );
    return res.status(StatusCodes.OK).json(users);
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to read the content team.");
  }
};

//Controller 13
const removeFromTeam = async (req, res) => {
  if (req.user.role === "admin") {
    try {
      const { id } = req.query;
      let user = await User.findById(id, { role: 1, email: 1, name: 1 });
      user.role = "Normal";
      user.save();
      //sending email to creator
      const name = user.name;
      const intro = [
        "We are so sorry to let you go from the Macbease Content Team.",
        `It was a great experience working with you.All the best for your future endeavours.`,
      ];
      const outro =
        "This email contains privileged and confidential information intended solely for the use of the individual or entity named. If you are not the intended recipient, please notify the sender immediately and delete this message from your system. Unauthorized use, dissemination, or copying is strictly prohibited.";
      const subject = "Macbease Confirmation";
      const destination = [user.email];
      const { ses, params } = await sendMail(
        name,
        intro,
        outro,
        subject,
        destination
      );
      ses.sendEmail(params, function (err, data) {
        if (err) {
          console.log(err, err.stack);
        }
      });
      return res
        .status(StatusCodes.OK)
        .send("Successfully removed from Macbease content team!");
    } catch (error) {
      console.log(error.message);
      return res.status(StatusCodes.OK).send("Something went wrong.");
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to delete from content team.");
  }
};

//Controller 13
const editContent = async (req, res) => {
  try {
    const { contentId } = req.query;
    const content = await MacbeaseContent.findById(contentId, {
      idOfSender: 1,
      _id: 0,
    });
    if (content.idOfSender === req.user.id || req.user.role === "admin") {
      const updatedContent = await MacbeaseContent.findByIdAndUpdate(
        contentId,
        req.body
      );
      return res.status(StatusCodes.OK).send("Content successfully updated.");
    } else {
      return res
        .status(StatusCodes.OK)
        .send("You are not authorized to edit the content.");
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

//Controller to like a comment
const likeAComment = async (req, res) => {
  const { contentId, cid } = req.query;
  try {
    if (contentId && cid) {
      let content = await MacbeaseContent.findById(contentId, { comments: 1 });
      let comments = content.comments;
      let targetComment = comments[comments.length - cid];
      targetComment.likes = [req.user.id, ...targetComment.likes];
      comments[comments.length - cid] = targetComment;
      content.comments = comments;
      content.save();
      return res.status(StatusCodes.OK).send("Successfully liked the content.");
    } else {
      return res.status(StatusCodes.OK).send("Incomplete information.");
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

//Controller to unlike a comment
const unLikeAComment = async (req, res) => {
  const { contentId, cid } = req.query;
  try {
    if (contentId && cid) {
      let content = await MacbeaseContent.findById(contentId, { comments: 1 });
      let comments = content.comments;
      let targetComment = comments[comments.length - cid];
      targetComment.likes = targetComment.likes.filter(
        (item) => item !== req.user.id
      );
      comments[comments.length - cid] = targetComment;
      content.comments = comments;
      content.save();
      return res
        .status(StatusCodes.OK)
        .send("Successfully unliked the content.");
    } else {
      return res.status(StatusCodes.OK).send("Incomplete information.");
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const getBatchedContent = async (req, res) => {
  const { batch, batchSize } = req.query;
  try {
    const batchNum = parseInt(batch, 10) || 1;
    const size = parseInt(batchSize, 10) || 6;
    const skip = (batchNum - 1) * size;
    const contents = await MacbeaseContent.aggregate([
      { $sort: { _id: -1 } },
      { $skip: skip },
      { $limit: size },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong!");
  }
};

const getDateWiseContent = async (req, res) => {
  const { date, batch, batchSize } = req.query;
  let d = new Date(date);
  const parsedBatch = parseInt(batch, 10) || 1;
  const parsedBatchSize = parseInt(batchSize, 10) || 10;
  try {
    const content = await MacbeaseContent.aggregate([
      {
        $match: {
          timeStamp: { $gte: d },
        },
      },
      {
        $sort: { timeStamp: -1 },
      },
      {
        $skip: (parsedBatch - 1) * parsedBatchSize,
      },
      {
        $limit: parsedBatchSize,
      },
      {
        $addFields: {
          commentNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(content);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong!");
  }
};

const tagSearchContent = async (req, res) => {
  const { query } = req.query;
  try {
    const contents = await MacbeaseContent.aggregate([
      {
        $match: {
          tags: { $regex: new RegExp(query, "i") },
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const replyToComment = async (req, res) => {
  const { contentId, cid } = req.query;
  const body = req.body;
  try {
    if (contentId && cid) {
      let content = await MacbeaseContent.findById(contentId, { comments: 1 });
      let comments = content.comments;
      let targetComment = comments[comments.length - cid];
      let replies =
        targetComment.replies !== undefined ? targetComment.replies : [];
      replies.push(body);
      targetComment.replies = replies;
      comments[comments.length - cid] = targetComment;
      content.comments = comments;
      content.save();
      scheduleNotification2({
        pushToken: [targetComment.pushToken],
        title: `${body?.name} replied to your comment!`,
        body: `${body?.text.substring(0, 50)}...`,
        url: `https://macbease.com/app/content/${contentId}/Macbease`,
      });
      return res
        .status(StatusCodes.OK)
        .send("Successfully replied to comment.");
    } else {
      return res.status(StatusCodes.OK).send("Incomplete information.");
    }
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const getContentTeamAdmins = async (req, res) => {
  try {
    let team = await Admin.find({ role: "Content Team" }, { _id: 1 });
    if (team.length === 0) {
      team = await Admin.find({}, { _id: 1 });
    }
    const ids = team.map((item) => item._id);
    return res.status(StatusCodes.OK).json(ids);
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const searchContentByText = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Search query is missing" });
    }

    const regex = new RegExp(q, "i"); // 'i' for case-insensitive

    const contents = await MacbeaseContent.find(
      {
        text: { $regex: regex },
      },
      {
        _id: 1,
        text: 1,
        contentType: 1,
      }
    ).limit(12);

    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error("Error searching events:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

const getContentFromLastTimeStamp = async (req, res) => {
  try {
    const {
      timeStamp,
      operator = "lt", // 'lt' or 'gt'
      sort = "desc", // 'asc' or 'desc'
      limit = 12,
      commentSlice = 12,
      rangeStart,
      rangeEnd,
      sample,
    } = req.query;

    const pipeline = [];
    // Range-based match (e.g., between two timestamps)
    if (
      rangeStart &&
      rangeEnd &&
      rangeStart !== "undefined" &&
      rangeEnd !== "undefined"
    ) {
      const start = new Date(rangeStart);
      const end = new Date(rangeEnd);
      if (!isNaN(start) && !isNaN(end)) {
        pipeline.push({
          $match: {
            timeStamp: {
              $gte: start,
              $lt: end,
            },
          },
        });
      }
    }
    // Single-operator match (e.g., lt/gt with one timestamp)
    else if (timeStamp && ["lt", "gt"].includes(operator)) {
      const date = new Date(timeStamp);
      if (isNaN(date.getTime())) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ error: "Invalid timeStamp format." });
      }

      pipeline.push({
        $match: {
          timeStamp: {
            [`$${operator}`]: date,
          },
        },
      });
    }

    // Add fields for comment count and slicing
    pipeline.push({
      $addFields: {
        commentsNum: { $size: "$comments" },
        comments: { $slice: ["$comments", parseInt(commentSlice)] },
      },
    });

    // Add field for projecting vectors out
    pipeline.push({
      $project: { vector: 0 },
    });

    // Optional random sampling
    if (!isNaN(parseInt(sample))) {
      pipeline.push({
        $sample: { size: parseInt(sample) },
      });
    } else {
      // Apply sorting and limiting only if sampling is not requested
      pipeline.push(
        { $sort: { timeStamp: sort === "asc" ? 1 : -1 } },
        { $limit: parseInt(limit) }
      );
    }

    const macbeaseContents = await MacbeaseContent.aggregate(pipeline);

    return res.status(StatusCodes.OK).json(macbeaseContents);
  } catch (error) {
    console.error("Error fetching contents", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

const getMacbeaseContentByIds = async (req, res) => {
  try {
    const { ids, select } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Array of IDs is required." });
    }

    let query = MacbeaseContent.find({ _id: { $in: ids } });

    // Apply select only if valid fields are passed
    if (select && typeof select === "string" && select.trim().length > 0) {
      query = query.select(select);
    }

    const data = await query.lean();
    return res.status(StatusCodes.OK).json(data);
  } catch (error) {
    console.error("Error fetching contents", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

module.exports = {
  createContent,
  likeContent,
  comment,
  unlikeContent,
  deleteContent,
  getContent,
  getComments,
  getContentBySpan,
  getLikeStatus,
  getMacbeaseContribution,
  addToContentTeam,
  readContentTeam,
  removeFromTeam,
  getPopularComments,
  likeAComment,
  unLikeAComment,
  getBatchedContent,
  getDateWiseContent,
  tagSearchContent,
  editContent,
  replyToComment,
  getContentTeamAdmins,
  searchContentByText,
  getContentFromLastTimeStamp,
  getMacbeaseContentByIds,
};
