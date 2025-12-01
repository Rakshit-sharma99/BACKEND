const { StatusCodes } = require("http-status-codes");
const Content = require("../models/content");
const Admin = require("../models/admin");
const User = require("../models/user");
const Club = require("../models/club");
const Community = require("../models/community");
const MacbeaseContent = require("../models/macbeaseContent");
const Card = require("../models/card");
const schedule = require("node-schedule");
const { OpenAI } = require("openai");

const mongoose = require("mongoose");
const {
  scheduleNotification,
  generateUri,
  scheduleNotification2,
} = require("./utils");
const {
  lemmatize,
  getRelatedTags,
} = require("../controllers/commonControllers");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

//Controller 1
const createContent = async (req, res) => {
  try {
    const { contentType, sendBy, url, text, key, peopleTagged, belongsTo } =
      req.body;
    if (
      !contentType ||
      !sendBy ||
      (contentType !== "text" && !url) ||
      !peopleTagged ||
      !belongsTo
    )
      return res.status(StatusCodes.OK).send("Incomplete data.");
    let processedUrl = url;
    if (url && url.includes("#")) {
      processedUrl = url.replace(/(^|[^@])#/g, "$1@#");
    }
    let idOfSender = req.user.id;
    let data;
    let sender = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      pushToken: 1,
    });
    let group;
    let params;
    if (sendBy === "club") {
      group = await Club.findById(belongsTo, {
        name: 1,
        secondaryImg: 1,
        _id: 0,
      });
      params = {
        userName: sender.name,
        userPic: sender.image,
        clubTitle: group.name,
        clubCover: group.secondaryImg,
        userPushToken: sender.pushToken,
      };
    } else if (sendBy === "userCommunity") {
      group = await Community.findById(belongsTo, {
        title: 1,
        secondaryCover: 1,
        content: 1,
        _id: 0,
      });
      params = {
        userName: sender.name,
        userPic: sender.image,
        communityTitle: group.title,
        communityCover: group.secondaryCover,
        userPushToken: sender.pushToken,
      };
    }
    if (key === "normal") {
      data = {
        ...req.body,
        url: processedUrl,
        idOfSender,
        timeStamp: new Date(),
        params,
      };
    } else {
      data = {
        ...req.body,
        url: processedUrl,
        idOfSender,
        timeStamp: key,
        params,
      };
    }
    let content = await Content.create(data);
    let taggedLen = peopleTagged.length;
    for (let i = 0; i < taggedLen; i++) {
      let taggedInfo = peopleTagged[i];
      if (taggedInfo.type === "people") {
        console.log("person tagged");
        let taggedUser = await User.findById(taggedInfo._id);
        if (taggedUser) {
          if (sendBy === "club") {
            const notice = {
              value: `${sender.name} tagged you in his post!`,
              img1: sender.image,
              img2: processedUrl,
              expandType: "Club",
              expandData: {
                ...content._doc,
              },
              key: "tag",
              time: new Date(),
              uid: `${new Date()}/${taggedInfo._id}/${req.user.id}`,
            };
            taggedUser.taggedContents = [
              ...taggedUser.taggedContents,
              { type: "club", contentId: content._id },
            ];
            taggedUser.unreadNotice = [notice, ...taggedUser.unreadNotice];
            taggedUser.save();
          } else if (sendBy === "userCommunity") {
            const notice = {
              value: `${sender.name} tagged you in his post!`,
              img1: sender.image,
              img2: processedUrl,
              expandType: "Community",
              expandData: {
                ...content._doc,
              },
              key: "tag",
              time: new Date(),
              uid: `${new Date()}/${taggedInfo._id}/${req.user.id}`,
            };
            taggedUser.taggedContents = [
              ...taggedUser.taggedContents,
              { type: "community", contentId: content._id },
            ];
            taggedUser.unreadNotice = [notice, ...taggedUser.unreadNotice];
            taggedUser.save();
          }
        }
      } else if (taggedInfo.type === "community") {
        //logic goes here
        console.log("community tag logic");
      } else if (taggedInfo.type === "club") {
        //logic goes here
        console.log("club tag logic");
      }
    }
    return res.status(StatusCodes.OK).json({ contentId: content._id });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

//Controller 2
const likeContent = async (req, res) => {
  const { contentId, type } = req.body;
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
        Content.findById(contentId).select("-vector").session(session),
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
          url: `https://macbease.com/app/content/${contentId}/normal`,
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
      Content.findById(contentId, {
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
          url: `https://macbease.com/app/content/${contentId}/normal`,
        });
      } else {
        scheduleNotification2({
          pushToken: [contributorPushToken],
          title: `${user.name} commented on your post!`,
          body: `${content.text.substring(0, 50)}...`,
          url: `https://macbease.com/app/content/${contentId}/normal`,
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
        Content.findById(contentId, {
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
const deleteComment = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { contentId } = req.body;
    Content.findById(contentId, (err, content) => {
      if (err) return console.error(err);
      let comments = content.comments;
      comments = comments.filter((item) => item.id !== req.user.id);
      content.comments = [];
      content.comments.push(...comments);
      if (req.user.role === "user") {
        User.findById(req.user.id, (err, user) => {
          if (err) return console.error(err);
          let commentedContents = user.commentedContents;
          commentedContents = commentedContents.filter(
            (item) => item.contentId !== contentId
          );
          user.commentedContents = [];
          user.commentedContents.push(...commentedContents);
          user.save();
        });
      } else {
        Admin.findById(req.user.id, (err, admin) => {
          if (err) return console.error(err);
          let commentedContents = admin.commentedContents;
          commentedContents = commentedContents.filter(
            (item) => item.contentId !== contentId
          );
          admin.commentedContents = [];
          admin.commentedContents.push(...commentedContents);
          admin.save();
        });
      }
      content.save((err, update) => {
        if (err) return console.error(err);
        return res
          .status(StatusCodes.OK)
          .send("You have successfully deleted the comment.");
      });
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to delete this comment");
  }
};

//Controller 6
const deleteContent = async (req, res) => {
  const { contentId, adminId } = req.body;
  const content = await Content.findById(contentId);
  let isEligible = false;
  if (req.user.role === "admin" || content.idOfSender === req.user.id)
    isEligible = true;
  if (isEligible) {
    const deletedContent = await Content.findByIdAndDelete(contentId);
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

//Controller 7
const getContent = async (req, res) => {
  const { contentId } = req.query;
  try {
    const content = await Content.aggregate([
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

//Controller 8
const getComments = async (req, res) => {
  const { contentId, batch, batchSize, remainder } = req.query;
  let finalComments = [];
  try {
    const content = await Content.findById(contentId, { comments: 1, _id: 0 });
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
    const content = await Content.findById(contentId, { comments: 1 });
    let comments = content.comments;
    let popularComments = [];
    comments = comments.slice((batch - 1) * 10, batch * 10);

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

//Controller to like a comment
const likeAComment = async (req, res) => {
  const { contentId, cid } = req.query;
  try {
    if (contentId && cid) {
      let content = await Content.findById(contentId, { comments: 1 });
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
      let content = await Content.findById(contentId, { comments: 1 });
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

//Controller 9
const getContentBySpan = async (req, res) => {
  const { span } = req.query;
  let contents = await Content.find({ sendBy: "Macbease" }).select("-vector");
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

//helper function
const getSecondaryFeed = async (cachedEndTimeStamp, clubs) => {
  try {
    const clubIds = (clubs || []).map((item) => item.clubId);
    const oneMonthBefore = new Date(cachedEndTimeStamp);
    oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);
    const createAggregationPipeline = (matchCriteria) => [
      {
        $match: {
          ...matchCriteria,
          timeStamp: {
            $gte: oneMonthBefore,
            $lt: new Date(cachedEndTimeStamp),
          },
        },
      },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
      { $project: { vector: 0 } },
      { $sample: { size: 3 } },
    ];
    const macbeaseMatch = {};
    const commContentsMatch = {
      contentType: "image",
      sendBy: "userCommunity",
    };
    const clubContentsMatch = {
      contentType: "image",
      belongsTo: { $in: clubIds },
    };
    const [macbeaseContents, commContents, clubContents] =
      await Promise.allSettled([
        MacbeaseContent.aggregate(createAggregationPipeline(macbeaseMatch)),
        Content.aggregate(createAggregationPipeline(commContentsMatch)),
        Content.aggregate(createAggregationPipeline(clubContentsMatch)),
        Card.aggregate([
          {
            $match: {
              $expr: {
                $gt: [
                  { $size: { $split: [{ $ifNull: ["$value", ""] }, " "] } },
                  24,
                ],
              },
            },
          },
          { $sample: { size: 5 } },
          { $project: { vector: 0 } },
        ]),
      ]).then((results) =>
        results.map((r) => (r.status === "fulfilled" ? r.value : []))
      );

    const result = [...macbeaseContents, ...commContents, ...clubContents];
    return result;
  } catch (error) {
    console.error("Error fetching secondary feed:", error);
    return null;
  }
};

//Controller 10
const getContentForLanding = async (req, res) => {
  if (req.user.role === "user") {
    const { key, cachedStartTimeStamp, cachedEndTimeStamp, cachedFlagId } =
      req.query;
    let mode = "primary";
    const user = await User.findById(req.user.id, {
      lastActive: 1,
      name: 1,
      image: 1,
      _id: 1,
      feed: 1,
      eventFeed: 1,
      course: 1,
      role: 1,
      interests: 1,
      clubs: 1,
      communitiesCreated: 1,
      communitiesPartOf: 1,
      giftsSend: 1,
      chatRooms: 1,
      email: 1,
      unreadNotice: 1,
      level: 1,
      passoutYear: 1,
      field: 1,
      incompleteProfile: 1,
      notifications: 1,
      shortCuts: 1,
      incompleteFields: 1,
    });
    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found." });
    }
    const {
      course,
      role,
      interests,
      clubs,
      communitiesCreated,
      communitiesPartOf,
      giftsSend,
      name,
      image,
      chatRooms,
      email,
      unreadNotice,
      level,
      passoutYear,
      field,
      incompleteProfile,
      shortCuts,
      incompleteFields,
    } = user;
    const eventFeed = user.eventFeed;
    const eventFeedLenMid = Math.floor(eventFeed.length / 2);
    const eventFeed1 = eventFeed.slice(0, eventFeedLenMid);
    const eventFeed2 = eventFeed.slice(eventFeedLenMid);
    let lastActive = user.lastActive;
    lastActive = new Date(lastActive);
    let feed = user.feed || [];
    let newFeed = [];
    if (key !== "all") {
      const [randomCommunities, randomClubs] = await Promise.all([
        Community.aggregate([
          { $sample: { size: 3 } },
          { $project: { content: 1 } },
        ]),
        Club.aggregate([
          { $sample: { size: 3 } },
          { $project: { content: 1 } },
        ]),
      ]);
      const communityContentPromises = randomCommunities.map(
        async (community) => {
          const randomContent =
            community.content[
              Math.floor(Math.random() * community.content.length)
            ];
          if (randomContent) {
            const content = await Content.aggregate([
              {
                $match: {
                  _id: mongoose.Types.ObjectId(randomContent.contentId),
                },
              },
              {
                $addFields: {
                  commentsNum: { $size: "$comments" },
                  comments: { $slice: ["$comments", 12] },
                },
              },
            ]);
            if (content.length > 0) {
              return content[0];
            }
          }
          return null;
        }
      );

      const clubContentPromises = randomClubs.map(async (club) => {
        const randomContent =
          club.content[Math.floor(Math.random() * club.content.length)];
        if (randomContent) {
          const content = await Content.aggregate([
            {
              $match: {
                _id: mongoose.Types.ObjectId(randomContent.contentId),
              },
            },
            {
              $addFields: {
                commentsNum: { $size: "$comments" },
                comments: { $slice: ["$comments", 12] },
              },
            },
          ]);
          if (content.length > 0) {
            return content[0];
          }
        }
        return null;
      });

      const communityContents = (
        await Promise.all(communityContentPromises)
      ).filter(Boolean);
      const clubContents = (await Promise.all(clubContentPromises)).filter(
        Boolean
      );
      newFeed = [...newFeed, ...communityContents, ...clubContents];
    }
    if (key === "all") {
      let contentIds = feed.slice(0, 12).map((item) => item._id.toString());
      if (cachedFlagId) {
        const matchedIndex = contentIds.findIndex(
          (item) => item === cachedFlagId
        );
        if (matchedIndex !== -1) {
          contentIds = contentIds.slice(0, matchedIndex);
        }
      }
      const contentDocs = await Content.find({ _id: { $in: contentIds } })
        .select("-vector")
        .lean();
      const processedDocs = contentDocs
        .map((doc) => {
          if (doc) {
            const commentsNum = doc.comments.length;
            doc.comments = doc.comments.slice(0, 12);
            if (doc.sendBy === "userCommunity" || doc.sendBy === "club") {
              return {
                ...doc,
                commentsNum,
                irrelevanceVote: doc.sendBy === "userCommunity" ? 0 : undefined,
              };
            }
          }
          return null;
        })
        .filter(Boolean);
      user.feed = user.feed.slice(0, 12);
      user.eventFeed = user.eventFeed.slice(0, 12);
      user.lastActive = new Date();
      await user.save();
      if (cachedStartTimeStamp) {
        const macbeaseContents = await MacbeaseContent.aggregate([
          {
            $match: { timeStamp: { $gt: new Date(cachedStartTimeStamp) } },
          },
          { $sort: { timeStamp: -1 } },
          { $limit: 12 },
          {
            $addFields: {
              commentsNum: { $size: "$comments" },
              comments: { $slice: ["$comments", 12] },
            },
          },
        ]);
        newFeed = [...processedDocs, ...macbeaseContents];
      } else {
        const macbeaseContents = await MacbeaseContent.aggregate([
          { $sort: { timeStamp: -1 } },
          { $limit: 12 },
          {
            $addFields: {
              commentsNum: { $size: "$comments" },
              comments: { $slice: ["$comments", 12] },
            },
          },
        ]);
        newFeed = [...processedDocs, ...macbeaseContents];
      }
    }
    newFeed = newFeed.sort(
      (a, b) => new Date(b.timeStamp) - new Date(a.timeStamp)
    );
    if (cachedEndTimeStamp && newFeed.length === 0) {
      newFeed = await getSecondaryFeed(cachedEndTimeStamp, clubs);
      mode = "secondary";
    }
    let rand1 = Math.ceil(Math.random() * newFeed.length);
    let rand2 = newFeed.length - rand1;
    if (rand1 === rand2) rand2 += 1;
    if (rand1 > rand2) [rand1, rand2] = [rand2, rand1];
    const cardContents = await Card.aggregate([
      {
        $match: {
          $expr: {
            $gt: [
              { $size: { $split: [{ $ifNull: ["$value", ""] }, " "] } },
              24,
            ],
          },
        },
      },
      { $sample: { size: 5 } },
      { $project: { vector: 0 } },
    ]);

    let data1 = [
      newFeed[0],
      ...(cardContents.length > 0 ? [cardContents[0]] : []),
      ...newFeed.slice(1, rand1),
      ...(cardContents.length > 1 ? [cardContents[1]] : []),
    ];
    let data2 = [
      ...(cardContents.length > 2 ? [cardContents[2]] : []),
      ...newFeed.slice(rand1, rand2),
    ];
    let data3 = [
      ...(cardContents.length > 3 ? cardContents.slice(3) : []),
      ...newFeed.slice(rand2),
    ];

    if (key === "all") {
      const clubs = await Club.aggregate([
        { $match: { members: { $ne: req.user.id } } },
        { $project: { secondaryImg: 1, name: 1, tags: 1, motto: 1, _id: 1 } },
        { $sample: { size: 6 } },
      ]);

      const communities = await Community.aggregate([
        {
          $match: {
            members: {
              $not: {
                $elemMatch: { $eq: new mongoose.Types.ObjectId(req.user.id) },
              },
            },
          },
        },
        {
          $project: {
            secondaryCover: 1,
            title: 1,
            tag: 1,
            activeMembers: 1,
            label: 1,
            _id: 1,
            content: 1,
          },
        },
        { $sample: { size: 6 } },
      ]);

      const recommendedContentPromises = communities.map(async (community) => {
        if (community.content.length > 0) {
          const randomContent =
            community.content[
              Math.floor(Math.random() * community.content.length)
            ];
          const content = await Content.findOne({
            _id: randomContent.contentId,
          })
            .select("-vector")
            .lean();
          if (content) {
            content.commentsNum = content.comments.length;
            content.comments = content.comments.slice(0, 6);
            content.recommended = true;
            return content;
          }
        }
        return null;
      });

      const recommendedContents = (
        await Promise.all(recommendedContentPromises)
      ).filter(Boolean);
      const [rc1, rc2, rc3, rc4, rc5, rc6] = recommendedContents;

      if (rc1) data1.push(rc1);
      if (rc2) data2.push(rc2);
      if (rc3) data3.push(rc3);
      if (rc4) data1.push(rc4);
      if (rc5) data2.push(rc5);
      if (rc6) data3.push(rc6);

      return res.status(StatusCodes.OK).json({
        data1,
        data2,
        data3,
        eventFeed1,
        eventFeed2,
        name: user.name,
        image: user.image,
        bio: {
          course,
          role,
          interests,
          clubs: clubs.length,
          communitiesCreated: communitiesCreated.length,
          communitiesPartOf: communitiesPartOf.length,
          giftsSend: giftsSend.length,
          name,
          image,
          chatRooms,
          email,
          notices: unreadNotice.length,
          level,
          passoutYear,
          field,
          incompleteProfile,
          shortCuts,
          incompleteFields,
        },
        clubRecommendations: clubs,
        communityRecommendations: communities,
        cache: mode === "primary" ? true : false,
      });
    } else {
      return res.status(StatusCodes.OK).json({
        data1,
        data2,
        data3,
      });
    }
  }
};

//Controller 11
const getRandomContent = async (req, res) => {
  let { size } = req.query;
  size = Number(size);
  let communities = await Community.aggregate([{ $sample: { size: size } }]);
  let clubs = await Club.aggregate([{ $sample: { size: size } }]);
  let content = [];
  for (let i = 0; i < size; i++) {
    //choosing 1 random content pin from club
    let club = clubs[i];
    if (club) {
      let clubContent = club.content;
      let clubContentLen = clubContent.length;
      if (clubContentLen !== 0) {
        let random = Math.floor(Math.random() * clubContentLen);
        let chosenContent = {
          content: clubContent[random],
          clubTitle: club.name,
          clubCover: club.secondaryImg,
        };
        content.push(chosenContent);
      }
    }

    //choosing 1 random content pin from community
    let community = communities[i];
    if (community) {
      let communityContent = community.content;
      let communityContentLen = communityContent.length;
      if (communityContentLen !== 0) {
        let random2 = Math.floor(Math.random() * communityContentLen);
        let chosenContent2 = {
          content: communityContent[random2],
          communityTitle: community.title,
          communityCover: community.secondaryCover,
        };
        content.push(chosenContent2);
      }
    }
  }

  let actualDataArr = [];
  for (let l = 0; l < content.length; l++) {
    let data = content[l];
    let actualData = await Content.findById(data.content.contentId).select(
      "-vector"
    );
    if (actualData) {
      actualData = actualData._doc;
      if (data.communityTitle) {
        let withPicData = {
          ...actualData,
          communityTitle: data.communityTitle,
          communityCover: data.communityCover,
          irrelevanceVote: data.content.irrelevanceVote,
        };
        actualDataArr.push(withPicData);
      } else if (data.clubTitle) {
        let withPicData = {
          ...actualData,
          clubTitle: data.clubTitle,
          clubCover: data.clubCover,
        };
        actualDataArr.push(withPicData);
      }
    }
  }
  return res.status(StatusCodes.OK).json({ actualDataArr });
};

//Controller 12
const editContent = async (req, res) => {
  try {
    const { contentId } = req.query;
    const content = await Content.findById(contentId, {
      idOfSender: 1,
      _id: 0,
    });
    if (content.idOfSender === req.user.id || req.user.role === "admin") {
      const updatedContent = await Content.findByIdAndUpdate(
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

//test controller
const getMacbContent = async (req, res) => {
  if (req.user.role === "user") {
    let macbeaseContents = await MacbeaseContent.find({})
      .sort({ timeStamp: -1 })
      .limit(12)
      .select("-vector");
    let actualSocialData = [];
    for (let m = 0; m < macbeaseContents.length; m++) {
      let obj = macbeaseContents[m];
      obj = obj._doc;
      let user = await User.findById(obj.belongsTo, {
        image: 1,
        name: 1,
        _id: 0,
        pushToken: 1,
      });
      let data = {
        ...obj,
        contributorName: user.name,
        contributorPic: user.image,
        userPushToken: user.pushToken,
      };
      actualSocialData.push(data);
    }
    return res.status(StatusCodes.OK).json(actualSocialData);
  }
};

const searchContentByTag = async (req, res) => {
  const { query } = req.query;
  try {
    const lemmatizedTags = lemmatize([query]);
    let allTags = await getRelatedTags(lemmatizedTags);
    let uniqueContent = [];
    let relatedContent = [];
    for (let i = 0; i < allTags.length; i++) {
      let tag = allTags[i];
      let pipeline = [
        {
          $match: {
            tags: { $regex: new RegExp(tag, "i") },
          },
        },
        {
          $limit: 6,
        },
      ];
      let contentFound = await Content.aggregate(pipeline);
      let macbeaseContentFound = await MacbeaseContent.aggregate(pipeline);
      contentFound = [...contentFound, ...macbeaseContentFound];
      for (let j = 0; j < contentFound.length; j++) {
        let contentId = contentFound[j]._id.toString();
        if (!uniqueContent.includes(contentId)) {
          uniqueContent.push(contentId);
          relatedContent.push(contentFound[j]);
        }
      }
    }
    let actualContent = [];
    for (let k = 0; k < relatedContent.length; k++) {
      let dataPoint = relatedContent[k];
      if (dataPoint.sendBy === "club") {
        let senderId = dataPoint.idOfSender;
        let clubId = dataPoint.belongsTo;
        const user = await User.findById(senderId, {
          name: 1,
          image: 1,
          pushToken: 1,
          _id: 0,
        });
        const club = await Club.findById(clubId, {
          name: 1,
          secondaryImg: 1,
          _id: 0,
        });
        if (club && user) {
          let extendedDataPoint = {
            ...dataPoint,
            userName: user.name,
            userPic: user.image,
            clubTitle: club.name,
            clubCover: club.secondaryImg,
            userPushToken: user.pushToken,
          };
          actualContent.push(extendedDataPoint);
        }
      } else if (dataPoint.sendBy === "Macbease") {
        let senderId = dataPoint.belongsTo;
        let user = await User.findById(senderId, {
          image: 1,
          name: 1,
          _id: 0,
          pushToken: 1,
        });
        if (user) {
          let extendedDataPoint = {
            ...dataPoint,
            contributorName: user.name,
            contributorPic: user.image,
            userPushToken: user.pushToken,
          };
          actualContent.push(extendedDataPoint);
        }
      } else if (dataPoint.sendBy === "userCommunity") {
        let senderId = dataPoint.idOfSender;
        let communityId = dataPoint.belongsTo;
        const user = await User.findById(senderId, {
          name: 1,
          image: 1,
          pushToken: 1,
          _id: 0,
        });
        const community = await Community.findById(communityId, {
          title: 1,
          secondaryCover: 1,
          content: 1,
          _id: 0,
        });
        if (community && user) {
          let extendedDataPoint = {
            ...dataPoint,
            userName: user.name,
            userPic: user.image,
            communityTitle: community.title,
            communityCover: community.secondaryCover,
            irrelevanceVote: 0,
            userPushToken: user.pushToken,
          };
          actualContent.push(extendedDataPoint);
        }
      }
    }
    return res.status(StatusCodes.OK).json({ actualContent });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const redundancy = async (req, res) => {
  //sending an email
  const contentMetaData = await Content.findById("657c5009f18136e2f6923acf", {
    url: 1,
  });
  const community = await Community.findById("66ed18fe0c4142316f4c43f7", {
    title: 1,
    secondaryCover: 1,
  });
  const img = await generateUri(contentMetaData.url.split("@")[0]);
  scheduleNotification(
    [
      "fRI5zs8OTD2vtviWbWsKpP:APA91bE_nX-PyfaL1ir6PsneMhogaap4-QFIyMezdkVLumiJikYFCUKxvt2kcqGyQ4jV6K1a_YiAFfgBYb2w9SHzvkXGVdSrNqt0_hR-CVZtp5vQknWtSAw",
    ],
    `Amartya posted in Mamaba Mentality.`,
    `You can use this HTML in your sendEmail function by setting it as the html field`,
    img
  );
  console.log("img", img);
  return res.status(StatusCodes.OK).send("done!");
};

const loadMoreContent = async (req, res) => {
  try {
    let { lastTimeStamp } = req.query;
    const parsedTimeStamp = lastTimeStamp
      ? new Date(lastTimeStamp)
      : new Date();
    const macbeaseContents = await MacbeaseContent.aggregate([
      { $match: { timeStamp: { $lt: parsedTimeStamp } } },
      { $sort: { timeStamp: -1 } },
      { $limit: 12 },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
    ]);
    if (macbeaseContents.length === 0) {
      return res.status(StatusCodes.OK).json([]);
    }
    const startRange = macbeaseContents[0].timeStamp;
    const endRange = macbeaseContents[macbeaseContents.length - 1].timeStamp;
    const userInfo = await User.findById(req.user.id, {
      communitiesPartOf: 1,
      clubs: 1,
    });
    let belongsTo = [
      ...userInfo.communitiesPartOf.map((item) => item.communityId),
      ...userInfo.clubs.map((item) => item.clubId),
    ];
    const [otherClubs, otherCommunities] = await Promise.all([
      Club.find({ _id: { $nin: belongsTo } })
        .limit(2)
        .exec(),
      Community.find({ _id: { $nin: belongsTo } })
        .limit(2)
        .exec(),
    ]);
    belongsTo = [
      ...belongsTo,
      ...otherClubs.map((item) => item._id.toString()),
      ...otherCommunities.map((item) => item._id.toString()),
    ];
    const contents = await Content.find({
      belongsTo: { $in: belongsTo },
      timeStamp: { $lt: startRange, $gte: endRange },
    })
      .sort({ timeStamp: -1 })
      .limit(24)
      .select("-vector")
      .lean();
    const modifiedContents = contents.map((content) => ({
      ...content,
      commentsNum: content.comments.length,
      comments: content.comments.slice(0, 6),
    }));
    const combinedFeed = [...macbeaseContents, ...modifiedContents].sort(
      (a, b) => new Date(b.timeStamp) - new Date(a.timeStamp)
    );
    return res.status(StatusCodes.OK).json(combinedFeed);
  } catch (error) {
    console.error("Error fetching older content:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to retrieve content.");
  }
};

const replyToComment = async (req, res) => {
  const { contentId, cid } = req.query;
  const body = req.body;
  try {
    if (contentId && cid) {
      let content = await Content.findById(contentId, { comments: 1 });
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
        url: `https://macbease.com/app/content/${contentId}/normal`,
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

// Function to create embeddings for content
const contentEmbedding = async (req, res) => {
  try {
    let contents = await Content.find({});

    for (let i = 0; i < contents.length; i++) {
      let content = contents[i];
      if (content.vector.length === 0) {
        const tagsString = content.tags ? content.tags.join(", ") : "";
        const combinedInput = `${content.text} ${tagsString}`;

        try {
          const embedding = await openai.embeddings.create({
            model: "text-embedding-3-small",
            input: combinedInput,
            encoding_format: "float",
          });

          console.log(`Embedding generated for content ID: ${content.text}`);
          content.vector = embedding.data[0].embedding;
          await content.save();
          console.log(
            `Successfully saved embedding for content ID: ${content.text}`
          );
        } catch (err) {
          console.error(`Failed to process content ID: ${i + 1}`, err.message);
        }

        // Delay to respect rate limits
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    return res.status(StatusCodes.OK).send("Successful");
  } catch (error) {
    console.error("Error during content embedding process:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

// Vector search on content
const searchContent = async (req, res) => {
  const { query } = req.body;
  try {
    if (!query) {
      return res.status(StatusCodes.BAD_REQUEST).send("Query is required.");
    }

    const embedding = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      encoding_format: "float",
    });

    const contents = await Content.aggregate([
      {
        $vectorSearch: {
          queryVector: embedding.data[0].embedding,
          path: "vector",
          numCandidates: 100,
          limit: 5,
          index: "vector_index",
        },
      },
      {
        $project: {
          vector: 0,
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

// Search Content by Community
const searchByCommunity = async (req, res) => {
  const { id } = req.query;
  const { query } = req.body;

  try {
    if (!id || !query) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Id and query is required.");
    }

    const community = await Community.findById(id);

    if (!community) {
      return res.status(404).send("Community not found.");
    }

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      encoding_format: "float",
    });

    const queryVector = embeddingResponse.data[0].embedding;

    const contents = await Content.aggregate([
      {
        $vectorSearch: {
          queryVector: queryVector,
          path: "vector",
          numCandidates: 100,
          limit: 5,
          index: "vector_index",
        },
      },
      {
        $match: {
          belongsTo: id,
        },
      },
      {
        $project: {
          vector: 0,
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error("Error:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const generateHashTags = async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res.status(400).json({ error: "text is required" });
  }
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Generate an array of hashtags for the text - ${text}.Separate hashtags by white space. Only one word hashtags are considered valid. Do not include "#" symbol.`,
        },
      ],
      max_tokens: 100,
    });

    const generatedHashTags = response.choices[0].message.content;
    res.json({ generatedHashTags: generatedHashTags });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while generating the about section" });
  }
};

// controller to get new engagement data for the cached feed
const getEngagementData = async (req, res) => {
  try {
    const { contentIds, macbeaseContentIds, cardIds } = req.body;

    if (!Array.isArray(contentIds) || contentIds.length === 0) {
      return res.status(400).json({ error: "Invalid content IDs array." });
    }

    // Fetch only likes & comments for the given content IDs
    const [contentData, macbeaseContentData, cardsData] = await Promise.all([
      Content.find({ _id: { $in: contentIds } })
        .select("likes comments")
        .lean(),
      MacbeaseContent.find({ _id: { $in: macbeaseContentIds } })
        .select("likes comments")
        .lean(),
      Card.find({ _id: { $in: cardIds } })
        .select("likedBy")
        .lean(),
    ]); // `lean()` makes the query faster by returning plain JS objects

    // Convert the array into a map (object) with content IDs as keys
    const allData = [...contentData, ...macbeaseContentData, ...cardsData];
    const engagementMap = {};
    allData.forEach((content) => {
      if (content?.likes) {
        engagementMap[content._id] = {
          likes: content.likes, // Return count instead of array
          comments: content.comments.slice(0, 6), // Return first 6 comments
          commentsNum: content.comments.length, // Total comment count
        };
      } else {
        engagementMap[content._id] = {
          likedBy: content.likedBy,
        };
      }
    });

    return res.json(engagementMap);
  } catch (error) {
    console.error("Error fetching engagement data:", error);
    return res.status(500).json({ error: "Internal server error" });
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

    const contents = await Content.find(
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

module.exports = {
  redundancy,
  getPopularComments,
  likeAComment,
  unLikeAComment,
  createContent,
  likeContent,
  comment,
  unlikeContent,
  deleteComment,
  deleteContent,
  getContent,
  getComments,
  getContentBySpan,
  getContentForLanding,
  getRandomContent,
  getMacbContent,
  searchContentByTag,
  editContent,
  replyToComment,
  loadMoreContent,
  contentEmbedding,
  searchContent,
  searchByCommunity,
  generateHashTags,
  getEngagementData,
  searchContentByText,
};
