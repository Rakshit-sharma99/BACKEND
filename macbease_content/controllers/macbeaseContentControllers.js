const { StatusCodes } = require("http-status-codes");
const { v4: uuidv4 } = require("uuid");
const MacbeaseContent = require("../models/macbeaseContent");
const {
  fetchNativeUserData,
  fetchUserData,
  generateUri,
  scheduleNotification2,
  scheduleNotification,
} = require("./utilControllers");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const { default: mongoose } = require("mongoose");

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
    universeMetaData,
  } = req.body;
  if (
    !contentType ||
    !sendBy ||
    (contentType !== "text" && !url) ||
    !text ||
    !peopleTagged ||
    !universeMetaData
  ) {
    return res.status(StatusCodes.BAD_REQUEST).send("Incomplete data.");
  }

  let processedUrl = url;
  if (url && url.includes("#")) {
    processedUrl = url.replace(/(^|[^@])#/g, "$1@#");
  }

  const idOfSender = req.user.id;
  const timestamp = key === "normal" ? new Date() : key;

  try {
    const user_query = {
      id: idOfSender,
      fields: [
        "name",
        "image",
        "pushToken",
        "macbeaseContentContribution",
        "tunedIn_By",
      ],
      callSign: "universe",
    };
    const user = await fetchNativeUserData(user_query);

    if (!user) return res.status(StatusCodes.NOT_FOUND).send("User not found.");

    const params = {
      contributorName: user.name,
      contributorPic: user.image,
      userPushToken: user.pushToken,
    };

    const data = {
      ...req.body,
      idOfSender,
      timeStamp: timestamp,
      params,
      uid: req.user.uid,
    };
    const content = await MacbeaseContent.create(data);

    if (project) {
      const payload = {
        projectId: project,
        contentId: content._id.toString(),
      };
      await sendKafkaMessage("CONTENT_ADDEDTO_PROJECT", "project", payload);
    }

    if (peopleTagged.length !== 0) {
      let taggedLen = peopleTagged.length;
      for (let i = 0; i < taggedLen; i++) {
        let taggedInfo = peopleTagged[i];
        if (taggedInfo.type === "people") {
          await sendKafkaMessage("PERSON_TAG_MACBEASE", taggedInfo.callSign, {
            taggedUser: taggedInfo._id,
            sender: {
              name: user.name,
              image: user.image,
            },
            processedUrl,
            content,
          });
        } else if (taggedInfo.type === "community") {
          console.log("community tag logic");
        } else if (taggedInfo.type === "club") {
          console.log("club tag logic");
        }
      }
    }
    await sendKafkaMessage("UPDATE_MACBEASECONTENT_CONTRIIBUTION", "universe", {
      userId: idOfSender,
      contentId: content._id.toString(),
    });

    await sendKafkaMessage("NOTIFY_TUNEDIN_USERS", "multiverse", {
      tunedIn_By: user.tunedIn_By,
      contentMetaData: {
        contentId: content._id.toString(),
        text: content.text,
        image: content.url,
        contentType,
      },
      contributorMetaData: {
        _id: idOfSender,
        name: user.name,
        image: user.image,
        pushToken: user.pushToken,
      },
    });

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
      const contentInfo =
        await MacbeaseContent.findById(contentId).session(session);

      const contentAlreadyLiked = contentInfo.likes.includes(userId);

      if (!contentAlreadyLiked) {
        contentInfo.likes.push(userId);
      }
      await contentInfo.save({ session });

      await sendKafkaMessage("LIKE_CONTENT_MACBEASE", "universe", {
        contentId,
        userId,
        type,
      });

      await session.commitTransaction();
      const user_query = {
        id: userId,
        fields: ["_id", "name", "pushToken", "image"],
      };
      const userInfo = await fetchUserData(user_query);
      await sendKafkaMessage(
        "LIKE_CONTENT_MACBEASE_SECONDARY_ACTION",
        contentInfo.universeMetaData.callSign,
        {
          contentId,
          publisherId: contentInfo.idOfSender,
          userInfo,
          contentInfo,
        },
      );

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

//Controller 3
const comment = async (req, res) => {
  const { contentId, type, text, peopleTagged, actionHandled } = req.body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(StatusCodes.BAD_REQUEST).send("Invalid comment.");
  }

  try {
    const user_query = {
      id: req.user.id,
      fields: ["_id", "name", "pushToken", "image"],
    };
    const [user, content] = await Promise.all([
      fetchUserData(user_query),
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

    const newComment = {
      cid: uuidv4(),
      text: text.trim(),
      peopleTagged: Array.isArray(peopleTagged) ? peopleTagged : [],
      likes: [],
      name: user.name,
      img: user.image,
      pushToken: user.pushToken,
      _id: user._id,
      createdAt: new Date(),
    };
    content.comments.unshift(newComment);
    await content.save();

    await sendKafkaMessage("COMMENT_CONTENT_MACBEASE", "universe", {
      cid: newComment.cid,
      userId: req.user.id,
      contentId,
      type,
    });

    const contributor_query = {
      id: content.idOfSender,
      fields: ["pushToken"],
    };
    const { pushToken: contributorPushToken } =
      await fetchUserData(contributor_query);

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
          img,
        );
      } else {
        scheduleNotification(
          [contributorPushToken],
          `${user.name} commented on your post!`,
          `${content.text.substring(0, 50)}...`,
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
      const contentInfo = await MacbeaseContent.findById(contentId, {
        likes: 1,
      }).session(session);

      if (!contentInfo) {
        throw new Error("Content not found.");
      }

      const userIdStr = String(userId);
      contentInfo.likes = contentInfo.likes.filter(
        (item) => String(item) !== userIdStr,
      );

      await contentInfo.save({ session });
      await session.commitTransaction();
      session.endSession();

      await sendKafkaMessage("UNLIKE_CONTENT_MACBEASE", "universe", {
        userId,
        contentId,
      });

      return res
        .status(StatusCodes.OK)
        .send("You have successfully unliked the content.");
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      if (error.hasErrorLabel?.("TransientTransactionError")) {
        retryCount++;
        console.warn(`Retrying transaction... attempt ${retryCount}`);
      } else {
        console.error("Unlike content error:", error);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send("Something went wrong.");
      }
    }
  }

  return res
    .status(StatusCodes.REQUEST_TIMEOUT)
    .send("Request timed out. Please try again later.");
};

//Controller 5
const deleteContent = async (req, res) => {
  try {
    const { contentId, adminId } = req.body;

    if (!contentId || !adminId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "Missing required fields: contentId and adminId are required.",
      });
    }

    const isEligible = req.user?.role === "admin";
    if (!isEligible) {
      return res.status(StatusCodes.FORBIDDEN).json({
        error:
          "You are not authorized to delete this content as you are neither creator nor admin.",
      });
    }

    const deletedContent = await MacbeaseContent.findByIdAndDelete(contentId);
    if (!deletedContent) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Content not found or already deleted.",
      });
    }
    await sendKafkaMessage("DELETE_CONTENT_MACBEASE", "universe", {
      adminId,
      contentUrl: deletedContent.url,
    });

    return res.status(StatusCodes.OK).json({
      message: "Content deleted successfully.",
    });
  } catch (error) {
    console.error("❌ Error in deleteContent:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Internal server error. Please try again later.",
    });
  }
};

//Controller 6
const getContent = async (req, res) => {
  const { contentId } = req.query;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "A valid contentId must be provided.",
    });
  }

  try {
    const content = await MacbeaseContent.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(contentId) },
      },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
    ]);

    if (!content.length) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Content not found.",
      });
    }

    return res.status(StatusCodes.OK).json(content[0]);
  } catch (error) {
    console.error("❌ Error fetching content by ID:", {
      contentId,
      error: error.message,
    });
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Internal server error while fetching content.",
    });
  }
};

//Controller 7
const getComments = async (req, res) => {
  const { contentId, batch, batchSize, remainder } = req.query;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "A valid contentId must be provided.",
    });
  }

  try {
    const content = await MacbeaseContent.findById(contentId, {
      comments: 1,
      _id: 0,
    });

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Content not found.",
      });
    }

    let finalComments = [];
    const allComments = content.comments || [];

    const parsedBatch = parseInt(batch, 10);
    const parsedBatchSize = parseInt(batchSize, 10);
    const parsedRemainder = parseInt(remainder, 10);

    if (!isNaN(parsedBatch) && !isNaN(parsedBatchSize)) {
      finalComments = allComments.slice(
        (parsedBatch - 1) * parsedBatchSize,
        parsedBatch * parsedBatchSize,
      );

      if (!isNaN(parsedRemainder) && parsedRemainder > 0) {
        finalComments.splice(0, parsedRemainder);
      }
    } else {
      finalComments = allComments;
    }

    return res.status(StatusCodes.OK).json({
      finalComments,
      total: allComments.length,
    });
  } catch (error) {
    console.error("❌ Error in getComments:", {
      contentId,
      error: error.message,
    });
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to fetch comments due to server error.",
    });
  }
};

const getPopularComments = async (req, res) => {
  const { contentId, batch } = req.query;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "A valid contentId must be provided.",
    });
  }

  try {
    const content = await MacbeaseContent.findById(contentId, {
      comments: 1,
    });

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Content not found.",
      });
    }

    const allComments = content.comments || [];

    const batchNumber = Math.max(1, parseInt(batch, 10) || 1);
    const commentsSlice = allComments.slice(
      (batchNumber - 1) * 100,
      batchNumber * 100,
    );

    const popularComments = commentsSlice
      .sort((a, b) => (b.likes?.length || 0) - (a.likes?.length || 0))
      .slice(0, 6);

    return res.status(StatusCodes.OK).json(popularComments);
  } catch (error) {
    console.error("❌ Error in getPopularComments:", {
      contentId,
      error: error.message,
    });

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to fetch popular comments due to server error.",
    });
  }
};

//Controller 8
const getContentBySpan = async (req, res) => {
  const { span } = req.query;

  const validSpans = ["today", "week", "all"];
  if (!span || !validSpans.includes(span)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "Invalid span. Must be one of: today, week, all.",
    });
  }

  try {
    let filter = {};

    const now = new Date();
    if (span === "today") {
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      filter = { timeStamp: { $gte: oneDayAgo } };
    } else if (span === "week") {
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      filter = { timeStamp: { $gte: oneWeekAgo } };
    }

    const result = await MacbeaseContent.find(filter);
    return res.status(StatusCodes.OK).json(result);
  } catch (error) {
    console.error("❌ Failed to fetch content by span:", {
      span,
      error: error.message,
    });

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Internal server error while fetching content.",
    });
  }
};

//Controller 9
const getLikeStatus = async (req, res) => {
  const { contentId } = req.query;

  if (!["admin", "user"].includes(req.user.role)) {
    return res.status(StatusCodes.FORBIDDEN).json({
      error: "You are not authorized to get the like status.",
    });
  }

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "A valid contentId must be provided.",
    });
  }

  try {
    const content = await MacbeaseContent.findById(contentId, {
      likes: 1,
      _id: 0,
    });

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Content not found.",
      });
    }

    const liked = content.likes.includes(req.user.id);
    return res.status(StatusCodes.OK).json({ liked });
  } catch (error) {
    console.error("❌ Error in getLikeStatus:", {
      contentId,
      userId: req.user.id,
      error: error.message,
    });

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Internal server error while checking like status.",
    });
  }
};

//Controller 10
const getMacbeaseContribution = async (req, res) => {
  const { id, batch, batchSize } = req.query;

  // Validate ID
  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "A valid user ID is required.",
    });
  }

  try {
    const user_query = {
      id,
      fields: ["macbeaseContentContribution"],
      callSign: "universe",
      batch,
      batchSize,
      arrayFieldForBatching: "macbeaseContentContribution",
    };

    const user = await fetchNativeUserData(user_query);

    const contentIds = (user?.macbeaseContentContribution || []).map(
      (id) => new mongoose.Types.ObjectId(id),
    );

    if (!Array.isArray(contentIds) || contentIds.length === 0) {
      return res.status(StatusCodes.OK).json([]);
    }

    const contents = await MacbeaseContent.aggregate([
      {
        $match: {
          _id: { $in: contentIds },
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
    console.error("❌ Error in getMacbeaseContribution:", {
      userId: id,
      error: error.message,
    });

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to fetch user's Macbease content contributions.",
    });
  }
};

/*
Controller 11 - This controller has been moved to universe user controller
const addToContentTeam = async (req, res) => {
  if (req.user.role !== "admin") {
    return res.status(StatusCodes.FORBIDDEN).json({
      error: "You are not authorized to add to the content team.",
    });
  }

  try {
    const { id } = req.query;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "A valid user ID must be provided.",
      });
    }

    await sendKafkaMessage("ADDTO_CONTENT_TEAM", "universe", {
      userId: id,
    });

    return res.status(StatusCodes.OK).json({
      message: "Successfully added to Macbease content team!",
    });
  } catch (error) {
    console.error("❌ Error in addToContentTeam:", {
      adminId: req.user.id,
      targetUserId: req.query.id,
      error: error.message,
    });

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Something went wrong while processing your request.",
    });
  }
};
*/

/*
Controller 12 - this controller has been moved to universe user controller
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
*/

/*
Controller 13 - this controller has been moved to universe user controller
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
*/

//Controller 13
const editContent = async (req, res) => {
  const { contentId } = req.query;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "A valid content ID must be provided.",
    });
  }

  try {
    const content = await MacbeaseContent.findById(contentId, {
      idOfSender: 1,
    });

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Content not found.",
      });
    }

    if (
      content.idOfSender?.toString() !== req.user.id &&
      req.user.role !== "admin"
    ) {
      return res.status(StatusCodes.FORBIDDEN).json({
        error: "You are not authorized to edit this content.",
      });
    }

    const updatedContent = await MacbeaseContent.findByIdAndUpdate(
      contentId,
      req.body,
      { new: true, runValidators: true },
    );

    return res.status(StatusCodes.OK).json({
      message: "Content successfully updated.",
      updatedContent,
    });
  } catch (error) {
    console.error("❌ Error updating content:", {
      contentId,
      userId: req.user.id,
      error: error.message,
    });

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Something went wrong while updating the content." });
  }
};

//Controller to like a comment
const likeAComment = async (req, res) => {
  const { contentId, cid } = req.query;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId) || !cid) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "A valid content ID and comment cid are required.",
    });
  }

  try {
    const content = await MacbeaseContent.findById(contentId, { comments: 1 });

    if (!content || !Array.isArray(content.comments)) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Content or comments not found.",
      });
    }

    const targetComment = content.comments.find(
      (comment) => comment.cid === cid,
    );

    if (!targetComment) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Comment with the given cid not found.",
      });
    }

    if (!targetComment.likes.includes(req.user.id)) {
      targetComment.likes.unshift(req.user.id);
      content.markModified("comments");
    }

    await content.save();

    return res.status(StatusCodes.OK).json({
      message: "Successfully liked the comment.",
    });
  } catch (error) {
    console.error("❌ Error liking comment:", error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Something went wrong while liking the comment.",
    });
  }
};

// //Controller to unlike a comment
const unLikeAComment = async (req, res) => {
  const { contentId, cid } = req.query;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId) || !cid) {
    return res.status(StatusCodes.BAD_REQUEST).json({
      error: "A valid content ID and comment cid are required.",
    });
  }

  try {
    const content = await MacbeaseContent.findById(contentId, { comments: 1 });

    if (!content || !Array.isArray(content.comments)) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Content or comments not found.",
      });
    }

    const targetComment = content.comments.find(
      (comment) => comment.cid === cid,
    );

    if (!targetComment) {
      return res.status(StatusCodes.NOT_FOUND).json({
        error: "Comment with the given cid not found.",
      });
    }

    const originalLength = targetComment.likes.length;

    targetComment.likes = targetComment.likes.filter(
      (userId) => userId !== req.user.id,
    );

    if (targetComment.likes.length !== originalLength) {
      content.markModified("comments");
      await content.save();
    }

    return res.status(StatusCodes.OK).json({
      message: "Successfully unliked the comment.",
    });
  } catch (error) {
    console.error("❌ Error unliking comment:", error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Something went wrong while unliking the comment.",
    });
  }
};

const getBatchedContent = async (req, res) => {
  try {
    const batch = parseInt(req.query.batch, 10);
    const batchSize = parseInt(req.query.batchSize, 10);

    const batchNum = Number.isInteger(batch) && batch > 0 ? batch : 1;
    const size = Number.isInteger(batchSize) && batchSize > 0 ? batchSize : 6;
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
    console.error("❌ Error in getBatchedContent:", error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Failed to fetch batched content.",
    });
  }
};

const getDateWiseContent = async (req, res) => {
  try {
    const { date, batch, batchSize } = req.query;

    if (!date || isNaN(Date.parse(date))) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        error: "A valid date is required.",
      });
    }

    const parsedDate = new Date(date);
    const parsedBatch = parseInt(batch, 10);
    const parsedBatchSize = parseInt(batchSize, 10);

    const skip =
      ((Number.isInteger(parsedBatch) && parsedBatch > 0 ? parsedBatch : 1) -
        1) *
      (Number.isInteger(parsedBatchSize) && parsedBatchSize > 0
        ? parsedBatchSize
        : 10);
    const limit =
      Number.isInteger(parsedBatchSize) && parsedBatchSize > 0
        ? parsedBatchSize
        : 10;

    const content = await MacbeaseContent.aggregate([
      {
        $match: {
          timeStamp: { $gte: parsedDate },
        },
      },
      { $sort: { timeStamp: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $addFields: {
          commentNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(content);
  } catch (error) {
    console.error("❌ Error in getDateWiseContent:", error.message);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      error: "Something went wrong while fetching date-wise content.",
    });
  }
};

const tagSearchContent = async (req, res) => {
  const { query } = req.query;

  if (!query || typeof query !== "string" || query.trim() === "") {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("Invalid tag search query.");
  }

  try {
    const contents = await MacbeaseContent.aggregate([
      {
        $match: {
          tags: { $regex: new RegExp(query.trim(), "i") },
        },
      },
      { $sort: { timeStamp: -1 } },
      {
        $addFields: {
          commentNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error("❌ tagSearchContent failed:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const replyToComment = async (req, res) => {
  const { contentId, cid } = req.query;
  const body = req.body;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId) || !cid) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("A valid content ID and comment cid are required.");
  }

  try {
    const content = await MacbeaseContent.findById(contentId, { comments: 1 });

    if (!content || !Array.isArray(content.comments)) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Content or comments not found.");
    }

    const targetComment = content.comments.find(
      (comment) => comment.cid === cid,
    );

    if (!targetComment) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Comment with the specified cid was not found.");
    }

    targetComment.replies = Array.isArray(targetComment.replies)
      ? targetComment.replies
      : [];

    targetComment.replies.push(body);
    content.markModified("comments");

    await content.save();

    if (targetComment.pushToken) {
      scheduleNotification2({
        pushToken: [targetComment.pushToken],
        title: `${body?.name} replied to your comment!`,
        body: `${(body?.text || "").substring(0, 50)}...`,
        url: `https://macbease.com/app/content/${contentId}/Macbease`,
      });
    }

    return res
      .status(StatusCodes.OK)
      .send("Your reply has been added successfully.");
  } catch (error) {
    console.error("❌ Error replying to comment:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to add reply to the comment.");
  }
};

/*
This controller has been moved to universe user controller
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
*/

const searchContentByText = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string" || q.trim() === "") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Search query is required and cannot be empty." });
    }

    const regex = new RegExp(q.trim(), "i");

    const contents = await MacbeaseContent.find(
      { text: { $regex: regex } },
      {
        _id: 1,
        text: 1,
        contentType: 1,
      },
    ).limit(12);

    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error("❌ Error searching content by text:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to search content.");
  }
};

const getContentFromLastTimeStamp = async (req, res) => {
  try {
    const {
      timeStamp,
      operator = "lt",
      sort = "desc",
      limit = "12",
      commentSlice = "12",
      rangeStart,
      rangeEnd,
      sample,
    } = req.query;

    const pipeline = [];

    const parsedLimit = parseInt(limit, 10);
    const parsedCommentSlice = parseInt(commentSlice, 10);
    const parsedSample = parseInt(sample, 10);

    // Range-based match
    if (
      rangeStart &&
      rangeEnd &&
      rangeStart !== "undefined" &&
      rangeEnd !== "undefined"
    ) {
      const start = new Date(rangeStart);
      const end = new Date(rangeEnd);

      if (!isNaN(start.getTime()) && !isNaN(end.getTime())) {
        pipeline.push({
          $match: {
            timeStamp: { $gte: start, $lt: end },
          },
        });
      } else {
        return res.status(StatusCodes.BAD_REQUEST).json({
          error: "Invalid rangeStart or rangeEnd timestamp.",
        });
      }
    }

    // Single timestamp with operator
    else if (timeStamp && ["lt", "gt"].includes(operator)) {
      const date = new Date(timeStamp);
      if (isNaN(date.getTime())) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .json({ error: "Invalid timeStamp format." });
      }

      pipeline.push({
        $match: {
          timeStamp: { [`$${operator}`]: date },
        },
      });
    }

    // Add comment metadata
    pipeline.push({
      $addFields: {
        commentsNum: { $size: "$comments" },
        comments: { $slice: ["$comments", parsedCommentSlice] },
      },
    });

    // Remove vector field
    pipeline.push({
      $project: { vector: 0 },
    });

    // Sampling or limit logic
    if (!isNaN(parsedSample)) {
      pipeline.push({
        $sample: { size: parsedSample },
      });
    } else {
      pipeline.push(
        { $sort: { timeStamp: sort === "asc" ? 1 : -1 } },
        { $limit: parsedLimit },
      );
    }

    const macbeaseContents = await MacbeaseContent.aggregate(pipeline);
    return res.status(StatusCodes.OK).json(macbeaseContents);
  } catch (error) {
    console.error("❌ Error fetching content from timestamp:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to fetch content.");
  }
};

const getMacbeaseContentByIds = async (req, res) => {
  try {
    const { ids, select } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "A non-empty array of content IDs is required." });
    }

    const objectIds = ids.map((id) =>
      id instanceof mongoose.Types.ObjectId
        ? id
        : new mongoose.Types.ObjectId(id),
    );

    const pipeline = [
      { $match: { _id: { $in: objectIds } } },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
    ];

    // If `select` is provided, transform it into a $project stage
    if (select && typeof select === "string" && select.trim()) {
      const fields = select.split(" ").reduce((acc, field) => {
        acc[field] = 1;
        return acc;
      }, {});
      pipeline.push({ $project: fields });
    }

    const content = await MacbeaseContent.aggregate(pipeline);

    return res.status(StatusCodes.OK).json(content);
  } catch (error) {
    console.error("❌ Error fetching Macbease content by IDs:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to fetch content.");
  }
};

const insertNewFields = async (req, res) => {
  try {
    const allMacbeaseContents = await MacbeaseContent.find({});

    const bulkOps = allMacbeaseContents.map((content) => ({
      updateOne: {
        filter: { _id: content._id },
        update: {
          $set: {
            uid: "696f491a0bfc89b35dc62326",
            universeMetaData: {
              location: "Punjab, India",
              logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
              logoKey: "public/universes/lpu_logo-removebg-preview.png",
              name: "Lovely Professional University",
              callSign: "LPU",
              lat: 31.25361,
              lng: 75.70361,
            },
          },
        },
      },
    }));

    const result = await MacbeaseContent.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} macbease contents`);

    res.status(StatusCodes.OK).json({
      message: "Macbease content updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.log("Error updating macbease content:", err);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Internal server error" });
  }
};

const getMacbeaseContentByField = async (req, res) => {
  try {
    const { limit = 5, select, sortField = "timeStamp", searchBy } = req.body;

    // Validate search fields
    if (!Object.keys(searchBy).length) {
      return res.status(400).json({
        success: false,
        message: "At least one search field is required.",
      });
    }

    let query = MacbeaseContent.find(searchBy)
      .sort({ [sortField]: -1 })
      .limit(Number(limit))
      .lean();

    // Apply select if present
    if (select) {
      query = query.select(select.replace(/,/g, " "));
    }

    const results = await query;

    return res.status(StatusCodes.OK).send(results);
  } catch (error) {
    console.error("Error fetching macbease content by field :", error);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Internal server error",
    });
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
  getPopularComments,
  likeAComment,
  unLikeAComment,
  getBatchedContent,
  getDateWiseContent,
  tagSearchContent,
  editContent,
  replyToComment,
  searchContentByText,
  getContentFromLastTimeStamp,
  getMacbeaseContentByIds,
  insertNewFields,
  getMacbeaseContentByField,
};
