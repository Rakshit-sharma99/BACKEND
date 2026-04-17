const { StatusCodes } = require("http-status-codes");
const {
  fetchUserData,
  fetchClubData,
  fetchCommunityData,
  generateUri,
  scheduleNotification2,
  lemmatize,
  fetchRelatedTags,
  fetchNativeUserData,
  checkUserBookmarks,
  fetchMultipleUserProfiles,
} = require("./utilControllers");
const Content = require("../models/content");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const { v4: uuidv4 } = require("uuid");
const { OpenAI } = require("openai");
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const migrationQueue = require("./migrationWorker");
const multer = require("multer");
const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

const redis = require("../config/redis");
const mongoose = require("mongoose");

//Controller 1
const createContent = async (req, res) => {
  try {
    const {
      contentType,
      sendBy,
      url,
      peopleTagged,
      belongsTo,
      universeMetaData,
    } = req.body;

    if (
      !contentType ||
      !sendBy ||
      (contentType !== "text" && !url) ||
      !peopleTagged ||
      !belongsTo ||
      !universeMetaData
    )
      return res.status(StatusCodes.BAD_REQUEST).send("Incomplete data.");
    let processedUrl = url;
    if (url && url.includes("#")) {
      processedUrl = url.replace(/(^|[^@])#/g, "$1@#");
    }
    const idOfSender = req.user.id;
    const user_query = {
      id: idOfSender,
      fields: ["name", "image", "pushToken"],
    };
    const sender = await fetchUserData(user_query);
    let group;
    let params;
    if (sendBy === "club") {
      const club_query = {
        id: belongsTo,
        fields: ["name", "secondaryImg", "universeMetaData"],
      };
      group = await fetchClubData(club_query);
      params = {
        userName: sender.name,
        userPic: sender.image,
        clubTitle: group.name,
        clubCover: group.secondaryImg,
        userPushToken: sender.pushToken,
        universeMetaData: group.universeMetaData,
      };
    } else if (sendBy === "userCommunity") {
      const community_query = {
        id: belongsTo,
        fields: ["title", "secondaryCover", "universeMetaData"],
      };
      group = await fetchCommunityData(community_query);
      params = {
        userName: sender.name,
        userPic: sender.image,
        communityTitle: group.title,
        communityCover: group.secondaryCover,
        userPushToken: sender.pushToken,
        universeMetaData: group.universeMetaData,
      };
    }
    const data = {
      ...req.body,
      url: processedUrl,
      idOfSender,
      params,
      uid: req.user.uid,
    };
    const content = await Content.create(data);
    let taggedLen = peopleTagged.length;
    for (let i = 0; i < taggedLen; i++) {
      let taggedInfo = peopleTagged[i];
      if (taggedInfo.type === "people") {
        await sendKafkaMessage("PERSON_TAG", taggedInfo.callSign, {
          sendBy,
          taggedUser: taggedInfo._id,
          sender: {
            name: sender.name,
            image: sender.image,
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
      const contentInfo = await Content.findById(contentId)
        .select("-vector")
        .session(session);
      const contentAlreadyLiked = contentInfo.likes.includes(userId);
      if (!contentAlreadyLiked) {
        contentInfo.likes.push(userId);
      }
      await contentInfo.save({ session });
      await sendKafkaMessage("LIKE_CONTENT", "universe", {
        contentId,
        userId,
        type,
      });
      await session.commitTransaction();
      const user_query = {
        id: userId,
        fields: ["name", "image", "pushToken", "_id"],
      };
      const userInfo = await fetchUserData(user_query);
      await sendKafkaMessage(
        "LIKE_CONTENT_SECONDARY_ACTION",
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
  const { contentId, type, text, peopleTagged } = req.body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(StatusCodes.BAD_REQUEST).send("Invalid comment.");
  }

  try {
    const user_query = {
      id: req.user.id,
      fields: ["name", "image", "pushToken", "_id", "uid", "universeMetaData"],
    };

    const [user, content] = await Promise.all([
      fetchUserData(user_query),
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
        .send("User or content not found.");
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
      uid: user.uid,
      universeMetaData: user.universeMetaData,
    };

    console.log("new comment", newComment);

    content.comments.unshift(newComment);
    await content.save();

    await sendKafkaMessage("COMMENT_CONTENT", "universe", {
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

    const notification = {
      pushToken: [contributorPushToken],
      title: `${user.name} commented on your post!`,
      body: `${(content.text || "").toString().substring(0, 50)}...`,
      url: `https://macbease.com/app/content/${contentId}/normal`,
    };

    if (content.contentType === "image") {
      try {
        const img = await generateUri(content.url.split("@")[0]);
        notification.image = img;
      } catch (imgErr) {
        console.error("Image generation failed", imgErr);
      }
    }

    scheduleNotification2(notification);

    return res.status(StatusCodes.OK).send("Comment posted successfully!");
  } catch (error) {
    console.error("Error in comment controller:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong!");
  }
};

//Controller 4
const unlikeContent = async (req, res) => {
  const { contentId } = req.body;
  const userId = req.user.id;
  const MAX_RETRIES = 3;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      const contentInfo = await Content.findById(contentId)
        .session(session)
        .select("likes");

      if (!contentInfo) {
        await session.abortTransaction();
        session.endSession();
        return res.status(StatusCodes.NOT_FOUND).send("Content not found.");
      }

      contentInfo.likes = contentInfo.likes.filter((item) => item !== userId);

      await contentInfo.save({ session });

      await sendKafkaMessage("UNLIKE_CONTENT", "universe", {
        userId,
        contentId,
      });

      await session.commitTransaction();
      session.endSession();

      return res
        .status(StatusCodes.OK)
        .send("You have successfully unliked the content.");
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      console.error("❌ Transaction error:", error);

      if (
        error.hasErrorLabel?.("TransientTransactionError") &&
        attempt < MAX_RETRIES
      ) {
        console.log(`🔁 Retrying transaction... attempt ${attempt}`);
      } else {
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .send("Something went wrong during unlike operation.");
      }
    }
  }
};

//Controller 5
const getContent = async (req, res) => {
  const { contentId, select } = req.query;

  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("Invalid content ID format.");
  }

  try {
    // Dynamically build the $project object
    let projectStage = {};

    if (select) {
      const fields = select.split(",").map((f) => f.trim());
      fields.forEach((field) => {
        projectStage[field] = 1;
      });

      // Optionally, always include _id if user forgets it
      projectStage._id = 1;
    } else {
      // Default projection: exclude vector
      projectStage = { vector: 0 };
    }

    const [content] = await Content.aggregate([
      {
        $match: { _id: new mongoose.Types.ObjectId(contentId) },
      },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
      {
        $project: projectStage,
      },
    ]);

    if (!content) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Could not find the content.");
    }

    return res.status(StatusCodes.OK).json(content);
  } catch (error) {
    console.error("❌ Error fetching content:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error fetching content.");
  }
};

//Controller 6
const getComments = async (req, res) => {
  const { contentId, batch = 1, batchSize = 10, remainder = 0 } = req.query;

  // Validate content ID
  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("Invalid content ID format.");
  }

  try {
    const content = await Content.findById(contentId, { comments: 1 });

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).send("Content not found.");
    }

    let comments = content.comments || [];

    const b = parseInt(batch);
    const s = parseInt(batchSize);
    const r = parseInt(remainder);

    // Basic pagination
    let finalComments = comments.slice((b - 1) * s, b * s);

    // Apply remainder offset if provided
    if (r > 0) {
      finalComments = finalComments.slice(r);
    }

    return res.status(StatusCodes.OK).json({
      finalComments,
      total: comments.length,
    });
  } catch (error) {
    console.error("❌ Error in getComments:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to fetch comments.");
  }
};

//Controller 7
const getPopularComments = async (req, res) => {
  const { contentId, batch = 1 } = req.query;

  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).send("Invalid content ID.");
  }

  try {
    const content = await Content.findById(contentId, { comments: 1 });
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).send("Content not found.");
    }

    let comments = content.comments || [];

    // Paginate: default batch size = 10
    const b = parseInt(batch);
    const pageComments = comments.slice((b - 1) * 10, b * 10);

    // Sort by number of likes (descending) and take top 6
    const popularComments = pageComments
      .sort((a, b) => b.likes.length - a.likes.length)
      .slice(0, 6);

    return res.status(StatusCodes.OK).json(popularComments);
  } catch (error) {
    console.error("❌ Error in getPopularComments:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 8
const likeAComment = async (req, res) => {
  const { contentId, cid } = req.query;

  if (!contentId || !cid) {
    return res.status(StatusCodes.BAD_REQUEST).send("Incomplete information.");
  }

  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).send("Invalid content ID.");
  }

  try {
    const content = await Content.findById(contentId, { comments: 1 });

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).send("Content not found.");
    }

    const comments = content.comments;
    const index = comments.findIndex((comment) => comment.cid === cid);

    if (index !== -1) {
      const targetComment = comments[index];
      const userId = req.user.id;

      if (!targetComment.likes.includes(userId)) {
        targetComment.likes.unshift(userId);
        content.comments[index] = targetComment;
        await content.save();
      }
    }

    return res.status(StatusCodes.OK).send("Successfully liked the comment.");
  } catch (error) {
    console.error("❌ Error in likeAComment:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 9
const unLikeAComment = async (req, res) => {
  const { contentId, cid } = req.query;

  if (!contentId || !cid) {
    return res.status(StatusCodes.BAD_REQUEST).send("Incomplete information.");
  }

  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).send("Invalid content ID.");
  }

  try {
    const content = await Content.findById(contentId, { comments: 1 });
    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).send("Content not found.");
    }

    const index = content.comments.findIndex((comment) => comment.cid === cid);
    if (index === -1) {
      return res.status(StatusCodes.NOT_FOUND).send("Comment not found.");
    }

    const targetComment = content.comments[index];
    targetComment.likes = targetComment.likes.filter(
      (userId) => userId !== req.user.id,
    );

    // Reassign the updated comment
    content.comments[index] = targetComment;
    await content.save();

    return res.status(StatusCodes.OK).send("Successfully unliked the comment.");
  } catch (error) {
    console.error("Error unliking comment:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 10
const getRandomContent = async (req, res) => {
  const { size = 10 } = req.query;
  try {
    const contents = await Content.aggregate([
      { $sample: { size: parseInt(size) } }, // Fetch random documents
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
      {
        $project: {
          vector: 0, // exclude vector field
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error("Error fetching random content:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to fetch random content.");
  }
};

//Controller 11
const editContent = async (req, res) => {
  const { contentId } = req.query;
  const userId = req.user.id;
  const isAdmin = req.user.role === "admin";

  if (!mongoose.Types.ObjectId.isValid(contentId)) {
    return res.status(StatusCodes.BAD_REQUEST).send("Invalid content ID.");
  }

  try {
    const content = await Content.findById(contentId).select("idOfSender");

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).send("Content not found.");
    }

    if (content.idOfSender !== userId && !isAdmin) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to edit this content.");
    }

    await Content.findByIdAndUpdate(contentId, req.body, {
      new: true,
      runValidators: true,
    });

    return res.status(StatusCodes.OK).send("Content successfully updated.");
  } catch (error) {
    console.error("Edit content error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 12
const searchContentByTag = async (req, res) => {
  const { query } = req.query;

  if (!query || typeof query !== "string") {
    return res.status(StatusCodes.BAD_REQUEST).send("Query is required.");
  }

  try {
    const lemmatizedTags = lemmatize([query]);
    const allTags = await fetchRelatedTags(lemmatizedTags);
    const regexTags = allTags.map((tag) => new RegExp(tag, "i"));

    const pipeline = [
      {
        $match: {
          tags: { $in: regexTags },
        },
      },
      {
        $group: {
          _id: "$_id",
          doc: { $first: "$$ROOT" }, // de-duplicate by _id
        },
      },
      {
        $replaceRoot: {
          newRoot: "$doc",
        },
      },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
      {
        $project: {
          vector: 0,
        },
      },
      {
        $limit: 30, // safeguard limit
      },
    ];

    const actualContent = await Content.aggregate(pipeline);

    return res.status(StatusCodes.OK).json({ actualContent });
  } catch (error) {
    console.error("Error in searchContentByTag:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 14
const replyToComment = async (req, res) => {
  const { contentId, cid } = req.query;
  const reply = req.body;

  if (!contentId || !cid) {
    return res.status(StatusCodes.BAD_REQUEST).send("Incomplete information.");
  }

  try {
    const content = await Content.findById(contentId, { comments: 1 });

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).send("Content not found.");
    }

    const commentIndex = content.comments.findIndex((c) => c.cid === cid);

    if (commentIndex === -1) {
      return res.status(StatusCodes.NOT_FOUND).send("Comment not found.");
    }

    // Add reply to the target comment
    const targetComment = content.comments[commentIndex];
    if (!targetComment.replies) targetComment.replies = [];
    targetComment.replies.push(reply);

    // Save the updated content
    await content.save();

    // Send notification
    if (targetComment.pushToken) {
      scheduleNotification2({
        pushToken: [targetComment.pushToken],
        title: `${reply?.name || "Someone"} replied to your comment!`,
        body: `${reply?.text?.substring(0, 50) || ""}...`,
        url: `https://macbease.com/app/content/${contentId}/normal`,
      });
    }

    return res.status(StatusCodes.OK).send("Successfully replied to comment.");
  } catch (error) {
    console.error("Error in replyToComment:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 15
const searchContent = async (req, res) => {
  const { query } = req.query;

  if (!query || typeof query !== "string" || !query.trim()) {
    return res.status(StatusCodes.BAD_REQUEST).send("Query is required.");
  }

  try {
    // Generate vector embedding from OpenAI
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      encoding_format: "float",
    });

    const embeddingVector = embeddingResponse?.data?.[0]?.embedding;

    if (!embeddingVector || !Array.isArray(embeddingVector)) {
      throw new Error("Invalid embedding vector returned from OpenAI.");
    }

    // Perform vector search
    const contents = await Content.aggregate([
      {
        $vectorSearch: {
          queryVector: embeddingVector,
          path: "vector",
          numCandidates: 100,
          limit: 5,
          index: "vector_index",
        },
      },
      {
        $project: {
          vector: 0, // exclude large vector field
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error("searchContent error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong while searching.");
  }
};

//Controller 16
const searchByCommunity = async (req, res) => {
  const { id } = req.query;
  const { query } = req.body;

  // Validate input
  if (
    !id ||
    typeof id !== "string" ||
    !query ||
    typeof query !== "string" ||
    !query.trim()
  ) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("Both 'id' (community ID) and 'query' are required.");
  }

  try {
    // Generate query embedding
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query,
      encoding_format: "float",
    });

    const queryVector = embeddingResponse?.data?.[0]?.embedding;

    if (!Array.isArray(queryVector)) {
      throw new Error("Failed to generate valid embedding vector.");
    }

    // Vector search + community match
    const contents = await Content.aggregate([
      {
        $vectorSearch: {
          queryVector,
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
          vector: 0, // remove heavy field
        },
      },
    ]);

    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error("searchByCommunity error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong during the search.");
  }
};

//Controller 17
const generateHashTags = async (req, res) => {
  const { text } = req.body;

  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Valid 'text' is required." });
  }

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "user",
          content: `Extract and return only space-separated, single-word hashtags from the following text. No symbols, no punctuation. Exclude "#" character. Return just the space-separated words:\n\n"${text}"`,
        },
      ],
      max_tokens: 60,
    });

    const rawOutput = response?.choices?.[0]?.message?.content || "";
    const hashtagArray = rawOutput
      .split(/\s+/)
      .map((tag) => tag.trim().toLowerCase())
      .filter((tag) => /^[a-z0-9]+$/.test(tag)); // keep only valid alphanumeric one-word hashtags

    return res.json({ hashtags: hashtagArray });
  } catch (error) {
    console.error("Hashtag generation failed:", error);
    return res.status(500).json({
      error: "An error occurred while generating hashtags.",
    });
  }
};

//Controller 19
const searchContentByText = async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== "string" || !q.trim()) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Search query is required." });
    }

    const regex = new RegExp(q.trim(), "i"); // Case-insensitive, trimmed input

    const contents = await Content.find(
      { text: { $regex: regex } },
      { _id: 1, text: 1, contentType: 1 },
    )
      .limit(12)
      .lean(); // Using lean for faster read performance

    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error("Error searching content:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send("Server error");
  }
};

//Controller 20
const getContentForLanding = async (req, res) => {
  try {
    const { cursor, limit, uid, universeId } = req.query;
    const userId = req.user.id;
    const parsedLimit = parseInt(limit) || 5;
    const parsedCursor = cursor ? new Date(cursor) : new Date();
    const resolvedUniverseId = universeId || uid || "multiverse";
    const universeFilter =
      resolvedUniverseId !== "multiverse" ? { uid: resolvedUniverseId } : {};
    const feedScopeKey = resolvedUniverseId || "multiverse";

    if (!cursor) {
      try {
        const cachedFeed = await redis.get(
          `landing_feed:${userId}:${feedScopeKey}`,
        );
        if (cachedFeed) {
          return res.status(StatusCodes.OK).json(JSON.parse(cachedFeed));
        }
      } catch (e) {
        console.error("Redis Cache Error:", e);
      }
    }
    // 2. Fetch User Data & Seen IDs
    const [user, seenIdsRaw] = await Promise.all([
      fetchNativeUserData({
        id: userId,
        fields: ["communitiesPartOf", "clubs", "interests"],
        callSign: "universe",
      }),
      redis.smembers(`seen_content:${userId}:${feedScopeKey}`),
    ]);

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found." });
    }

    const seenIds = (seenIdsRaw || [])
      .map((id) =>
        mongoose.Types.ObjectId.isValid(id)
          ? new mongoose.Types.ObjectId(id)
          : null,
      )
      .filter(Boolean);

    const communityIds = (user.communitiesPartOf || []).map(
      (c) => c.communityId,
    );
    const clubIds = (user.clubs || []).map((c) => c.clubId);
    const belongsToIds = [...communityIds, ...clubIds];
    const interestTags = user.interests || [];

    // 3. Define Queries (Excluding Seen IDs)

    // A. Followed Content (Clubs/Communities)
    const followedQuery = Content.aggregate([
      {
        $match: {
          belongsTo: { $in: belongsToIds },
          _id: { $nin: seenIds },
          timeStamp: { $lt: parsedCursor },
          $or: [
            { contentType: { $in: ["image", "video"] } },
            { contentType: "text", "externalSourceMetaData.relayedBy": "starman-bot" },
          ],
          ...universeFilter,
        },
      },
      { $sort: { timeStamp: -1 } },
      { $limit: parsedLimit },
      {
        $addFields: {
          feedType: "followed",
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
          likeCount: { $size: { $ifNull: ["$likes", []] } },
          isLiked: { $in: [userId, { $ifNull: ["$likes", []] }] },
          bookmarkCount: { $ifNull: ["$bookmarkCount", 0] },
        },
      },
      { $project: { vector: 0, likes: 0 } },
    ]);

    // B. Suggested Content (Interests)
    const suggestedQuery =
      interestTags.length > 0
        ? Content.aggregate([
            {
              $match: {
                tags: { $in: interestTags },
                belongsTo: { $nin: belongsToIds },
                _id: { $nin: seenIds },
                timeStamp: { $lt: parsedCursor },
                $or: [
                  { contentType: { $in: ["image", "video"] } },
                  { contentType: "text", "externalSourceMetaData.relayedBy": "starman-bot" },
                ],
                ...universeFilter,
              },
            },
            { $sort: { timeStamp: -1 } },
            { $limit: parsedLimit },
            {
              $addFields: {
                feedType: "suggested",
                commentsNum: { $size: "$comments" },
                comments: { $slice: ["$comments", 6] },
                likeCount: { $size: { $ifNull: ["$likes", []] } },
                isLiked: { $in: [userId, { $ifNull: ["$likes", []] }] },
                bookmarkCount: { $ifNull: ["$bookmarkCount", 0] },
              },
            },
            { $project: { vector: 0, likes: 0 } },
          ])
        : Promise.resolve([]);

    // Execute Initial Queries
    const [followedContent, suggestedContent] = await Promise.all([
      followedQuery,
      suggestedQuery,
    ]);

    // Merge & Deduplicate (in case overlap between followed/suggested)
    let combined = [...followedContent, ...suggestedContent];
    const uniqueCombined = Array.from(
      new Map(combined.map((item) => [item._id.toString(), item])).values(),
    );

    // Sort by Time
    uniqueCombined.sort(
      (a, b) => new Date(b.timeStamp) - new Date(a.timeStamp),
    );

    // 4. Fallback Mechanism
    // If we don't have enough content, fetch popular/random content
    let finalFeed = uniqueCombined;

    if (finalFeed.length < parsedLimit) {
      const needed = parsedLimit - finalFeed.length;

      // IDs to exclude in fallback (Seen + Just Fetched)
      const currentFetchedIds = finalFeed.map((c) => c._id);
      const excludeIdsForFallback = [...seenIds, ...currentFetchedIds];

      const fallbackContent = await Content.aggregate([
        {
          $match: {
            belongsTo: { $nin: belongsToIds },
            _id: { $nin: excludeIdsForFallback },
            timeStamp: { $lt: parsedCursor },
            $or: [
              { contentType: { $in: ["image", "video"] } },
              { contentType: "text", "externalSourceMetaData.relayedBy": "starman-bot" },
            ],
            ...universeFilter,
          },
        },
        { $sample: { size: needed * 2 } }, // Fetch more to ensure quality/shuffle
        {
          $addFields: {
            feedType: "suggested", // Mark as suggested so UI handles it gracefully
            commentsNum: { $size: "$comments" },
            comments: { $slice: ["$comments", 6] },
            likeCount: { $size: { $ifNull: ["$likes", []] } },
            isLiked: { $in: [userId, { $ifNull: ["$likes", []] }] },
            bookmarkCount: { $ifNull: ["$bookmarkCount", 0] },
          },
        },
        { $project: { vector: 0, likes: 0 } },
        { $limit: needed },
      ]);

      finalFeed = [...finalFeed, ...fallbackContent];
      // Resort after adding fallback
      finalFeed.sort((a, b) => new Date(b.timeStamp) - new Date(a.timeStamp));
    }

    // Trim to limit
    finalFeed = finalFeed.slice(0, parsedLimit);

    // Fetch bookmarks
    let finalFeedWithBookmarks = finalFeed;
    if (finalFeed.length > 0) {
      const contentIds = finalFeed.map((c) => c._id.toString());
      const bookmarkedIdsArray = await checkUserBookmarks({
        userId,
        contentIds,
      });
      const bookmarkedIdsSet = new Set(bookmarkedIdsArray);

      finalFeedWithBookmarks = finalFeed.map((item) => ({
        ...item,
        isBookmarked: bookmarkedIdsSet.has(item._id.toString()),
      }));
    }

    // 5. Update Seen List in Redis
    if (finalFeed.length > 0) {
      const newIds = finalFeed.map((c) => c._id.toString());
      const pipeline = redis.pipeline();
      pipeline.sadd(`seen_content:${userId}:${feedScopeKey}`, ...newIds);
      pipeline.expire(
        `seen_content:${userId}:${feedScopeKey}`,
        60 * 60 * 24,
      );
      await pipeline.exec();
    }

    const nextCursor =
      finalFeedWithBookmarks.length > 0
        ? finalFeedWithBookmarks[finalFeedWithBookmarks.length - 1].timeStamp
        : null;

    const responsePayload = {
      data: finalFeedWithBookmarks,
      nextCursor,
    };

    // Update Short-term Cache
    if (!cursor) {
      await redis.setex(
        `landing_feed:${userId}:${feedScopeKey}`,
        60,
        JSON.stringify(responsePayload),
      );
    }

    return res.status(StatusCodes.OK).json(responsePayload);
  } catch (err) {
    console.error("Error in getContentForLanding:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong");
  }
};

//Controller 21
const getMultipleContents = async (req, res) => {
  try {
    const { ids, select, filters = {}, userId } = req.body;

    // 1. Validate presence and type of IDs
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "No IDs provided." });
    }

    // 2. Validate and convert to ObjectIds
    const modifiedIds = ids
      .filter((id) => mongoose.Types.ObjectId.isValid(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    if (modifiedIds.length === 0) {
      return res.status(400).json({ error: "No valid Object IDs." });
    }

    // 3. Handle dynamic projection
    let projectStage = {};
    if (select && typeof select === "string" && select !== "undefined") {
      const fields = select
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);
      fields.forEach((field) => {
        projectStage[field] = 1;
      });

      projectStage._id = 1;
    } else {
      projectStage = { vector: 0, likes: 0 };
    }

    // 4. Build match condition with optional filters
    const matchCondition = {
      _id: { $in: modifiedIds },
      ...(filters && typeof filters === "object" ? filters : {}),
    };

    // 5. Build aggregation pipeline
    const contents = await Content.aggregate([
      { $match: matchCondition },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
          likeCount: { $size: { $ifNull: ["$likes", []] } },
          isLiked: userId
            ? { $in: [userId, { $ifNull: ["$likes", []] }] }
            : false,
        },
      },
      {
        $project: projectStage,
      },
      {
        $sort: { timeStamp: -1 },
      },
    ]);

    let finalContents = contents;
    if (userId && contents.length > 0) {
      const contentIds = contents.map((c) => c._id.toString());
      const bookmarkedIdsArray = await checkUserBookmarks({
        userId,
        contentIds,
      });
      const bookmarkedIdsSet = new Set(bookmarkedIdsArray);

      finalContents = contents.map((item) => ({
        ...item,
        isBookmarked: bookmarkedIdsSet.has(item._id.toString()),
      }));
    }

    return res.status(200).json(finalContents);
  } catch (error) {
    console.error("Error fetching multiple contents:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

//Controller 22
const searchContentFromIds = async (req, res) => {
  try {
    const { contentIds, search, contentType, select } = req.body;

    if (!Array.isArray(contentIds) || contentIds.length === 0) {
      return res.status(400).json({ error: "Invalid or empty contentIds." });
    }

    const regex = search ? new RegExp(search.trim(), "i") : null;

    const matchStage = {
      _id: { $in: contentIds.map((id) => new mongoose.Types.ObjectId(id)) },
    };

    if (contentType) {
      matchStage.contentType = contentType;
    }

    if (regex) {
      matchStage.$or = [
        { text: regex },
        { tags: regex },
        { contentType: regex },
      ];
    }

    let projectStage = null;
    if (Array.isArray(select) && select.length > 0) {
      projectStage = {};
      select.forEach((field) => {
        if (typeof field === "string" && field.trim()) {
          projectStage[field] = 1;
        }
      });
      projectStage._id = 1;
    }

    const pipeline = [
      { $match: matchStage },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
        },
      },
    ];

    if (projectStage) {
      pipeline.push({ $project: projectStage });
    }

    pipeline.push({ $unset: "vector" });

    pipeline.push({ $sort: { timeStamp: -1 } });

    const contents = await Content.aggregate(pipeline);

    return res.status(200).json(contents);
  } catch (error) {
    console.error("Error in searchContentFromIds:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const migrateCollectionController = async (req, res) => {
  const { sourceDbName, targetDbName, collectionName } = req.body;

  if (!sourceDbName || !targetDbName || !collectionName) {
    return res.status(400).json({
      error:
        "sourceDbName, targetDbName, and collectionName are required in the request body",
    });
  }

  const jobId = uuidv4();

  // Add to background queue
  migrationQueue.add({
    jobId,
    sourceDbName,
    targetDbName,
    collectionName,
  });

  return res.status(202).json({
    message: "Migration started",
    jobId,
  });
};

const uploadToS3 = async (req, res) => {
  try {
    const file = req.file;
    let { key } = req.body;

    if (!file) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ success: false, message: "No file provided!" });
    }

    const uniqueName = `${Date.now()}_${file.originalname.replace(/\s+/g, "_")}`;

    if (!key) {
      key = `public/content/${uniqueName}`;
    }

    const params = {
      Bucket: process.env.S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
    };

    s3.upload(params, (err, data) => {
      if (err) {
        console.error("S3 Upload Error:", err);
        return res
          .status(StatusCodes.INTERNAL_SERVER_ERROR)
          .json({ success: false, message: "Something went wrong" });
      }

      return res.status(StatusCodes.OK).json({
        success: true,
        message: "File uploaded successfully",
        key: data.Key,
      });
    });
  } catch (err) {
    console.log("Error uploading file to s3:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ success: false, message: "Something went wrong!" });
  }
};

const insertNewFields = async (req, res) => {
  try {
    const allcontents = await Content.find({});

    const bulkOps = allcontents.map((content) => ({
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

    const result = await Content.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} contents`);

    res.status(200).json({
      message: "Contents updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

//Controller 23
const getUserCommunityPosts = async (req, res) => {
  try {
    const { userId, communityId, cursor, limit } = req.query;

    if (!userId || !communityId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "userId and communityId are required." });
    }

    const parsedLimit = parseInt(limit) || 10;
    const parsedCursor = cursor ? new Date(cursor) : new Date();

    const pipeline = [
      {
        $match: {
          idOfSender: userId,
          belongsTo: communityId,
          timeStamp: { $lt: parsedCursor },
          contentType: { $in: ["image", "video", "text"] },
        },
      },
      { $sort: { timeStamp: -1 } },
      { $limit: parsedLimit },
      {
        $addFields: {
          commentsNum: { $size: "$comments" },
          comments: { $slice: ["$comments", 6] },
          likeCount: { $size: { $ifNull: ["$likes", []] } },
          isLiked: {
            $in: [req.user ? req.user.id : userId, { $ifNull: ["$likes", []] }],
          },
        },
      },
      { $project: { vector: 0, likes: 0 } },
    ];

    const contents = await Content.aggregate(pipeline);

    let finalFeedWithBookmarks = contents;
    if (contents.length > 0) {
      const contentIds = contents.map((c) => c._id.toString());
      const requesterId = req.user ? req.user.id : userId;
      const bookmarkedIdsArray = await checkUserBookmarks({
        userId: requesterId,
        contentIds,
      });
      const bookmarkedIdsSet = new Set(bookmarkedIdsArray);

      finalFeedWithBookmarks = contents.map((item) => ({
        ...item,
        isBookmarked: bookmarkedIdsSet.has(item._id.toString()),
      }));
    }

    const nextCursor =
      finalFeedWithBookmarks.length > 0
        ? finalFeedWithBookmarks[finalFeedWithBookmarks.length - 1].timeStamp
        : null;

    return res.status(StatusCodes.OK).json({
      data: finalFeedWithBookmarks,
      nextCursor,
    });
  } catch (error) {
    console.error("Error in getUserCommunityPosts:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong");
  }
};

/**
 * Hybrid search for Starman Q&A — combines vector search (semantic)
 * with regex text search to find relevant posts for a user question.
 */
const searchContentQA = async (req, res) => {
  try {
    const { query, uid } = req.body;

    if (!query || typeof query !== "string" || !query.trim()) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Query is required.", found: false });
    }

    // 1. Generate embedding for semantic search
    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: query.trim(),
      encoding_format: "float",
    });

    const embeddingVector = embeddingResponse?.data?.[0]?.embedding;

    // 2. Run vector search + text search in parallel
    // Extract meaningful keywords (strip stop words) for text search
    const STOP_WORDS = new Set([
      "did",
      "does",
      "do",
      "is",
      "are",
      "was",
      "were",
      "will",
      "would",
      "can",
      "could",
      "should",
      "has",
      "have",
      "had",
      "been",
      "being",
      "the",
      "a",
      "an",
      "and",
      "or",
      "but",
      "in",
      "on",
      "at",
      "to",
      "for",
      "of",
      "with",
      "by",
      "from",
      "it",
      "its",
      "this",
      "that",
      "what",
      "when",
      "where",
      "who",
      "how",
      "why",
      "which",
      "i",
      "me",
      "my",
      "we",
      "our",
      "you",
      "your",
      "he",
      "she",
      "they",
      "about",
      "any",
      "tell",
      "know",
      "find",
      "show",
      "get",
      "visit",
      "visited",
      "come",
      "came",
      "going",
      "go",
      "went",
      "next",
      "last",
      "new",
      "like",
      "also",
      "just",
      "very",
    ]);

    const keywords = query
      .trim()
      .replace(/[?!.,;:'"()]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));

    // Build aggregation that scores posts by how many keywords they match
    const minMatches = keywords.length > 1 ? 2 : 1;

    const keywordMatchFields = keywords.map((kw, i) => ({
      [`_kw${i}`]: {
        $cond: [
          {
            $regexMatch: {
              input: {
                $concat: [
                  { $ifNull: ["$text", ""] },
                  " ",
                  { $ifNull: ["$title", ""] },
                  " ",
                  { $ifNull: ["$metaData.name", ""] },
                ],
              },
              regex: kw,
              options: "i",
            },
          },
          1,
          0,
        ],
      },
    }));

    const scoreExpr =
      keywords.length > 0
        ? { $add: keywords.map((_, i) => `$_kw${i}`) }
        : { $literal: 0 };

    const textSearchPipeline =
      keywords.length > 0
        ? Content.aggregate([
            {
              $match: {
                $or: keywords.map((kw) => ({
                  $or: [
                    { text: { $regex: new RegExp(kw, "i") } },
                    { title: { $regex: new RegExp(kw, "i") } },
                    { "metaData.name": { $regex: new RegExp(kw, "i") } },
                  ],
                })),
              },
            },
            { $addFields: Object.assign({}, ...keywordMatchFields) },
            { $addFields: { _kwScore: scoreExpr } },
            { $match: { _kwScore: { $gte: minMatches } } },
            { $sort: { _kwScore: -1 } },
            { $limit: 10 },
            {
              $project: {
                vector: 0,
                comments: 0,
                ...Object.fromEntries(keywords.map((_, i) => [`_kw${i}`, 0])),
              },
            },
          ])
        : Content.find(
            {
              $or: [
                { text: { $regex: new RegExp(query.trim(), "i") } },
                { title: { $regex: new RegExp(query.trim(), "i") } },
                { "metaData.name": { $regex: new RegExp(query.trim(), "i") } },
              ],
            },
            { vector: 0, comments: 0 },
          )
            .limit(10)
            .lean();

    const [vectorResults, textResults] = await Promise.all([
      // Semantic / vector search
      embeddingVector && Array.isArray(embeddingVector)
        ? Content.aggregate([
            {
              $vectorSearch: {
                queryVector: embeddingVector,
                path: "vector",
                numCandidates: 200,
                limit: 10,
                index: "vector_index",
              },
            },
            {
              $addFields: {
                searchScore: { $meta: "vectorSearchScore" },
                commentsNum: { $size: "$comments" },
              },
            },
            {
              $project: {
                vector: 0,
                comments: 0,
              },
            },
          ])
        : Promise.resolve([]),

      // Text / keyword search — ranked by keyword match count
      textSearchPipeline,
    ]);

    // 3. Merge and deduplicate — text matches first (exact), then vector (semantic)
    const seen = new Set();
    const merged = [];

    // Text results first (exact keyword matches, always relevant)
    for (const doc of textResults) {
      const id = doc._id.toString();
      if (!seen.has(id)) {
        seen.add(id);
        merged.push({ ...doc, _source: "text" });
      }
    }
    // Then vector results (only if score is high enough to be truly relevant)
    for (const doc of vectorResults) {
      const id = doc._id.toString();
      if (!seen.has(id) && (doc.searchScore || 0) >= 0.75) {
        seen.add(id);
        merged.push({ ...doc, _source: "vector" });
      }
    }

    // 4. Trim to top 3 most relevant — return full docs for expandPost navigation
    const results = merged.slice(0, 3).map((doc) => {
      const cleaned = { ...doc };
      delete cleaned.vector;
      delete cleaned._source;
      delete cleaned._kwScore;
      // Add commentsNum convenience field
      if (!cleaned.commentsNum && cleaned.comments) {
        cleaned.commentsNum = cleaned.comments.length;
      }
      return cleaned;
    });

    return res.status(StatusCodes.OK).json({
      results,
      found: results.length > 0,
    });
  } catch (error) {
    console.error("searchContentQA error:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong.", found: false });
  }
};

// Controller - searchLikedByUsers
const searchLikedByUsers = async (req, res) => {
  const { contentId, query } = req.query;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("Valid content ID is required.");
  }

  if (!query || typeof query !== "string" || !query.trim()) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("Search query is required.");
  }

  try {
    const content = await Content.findById(contentId, { likes: 1 });

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).send("Content not found.");
    }

    const likes = content.likes || [];

    if (likes.length === 0) {
      return res.status(StatusCodes.OK).json({ users: [] });
    }

    const users = await fetchMultipleUserProfiles(likes);
    const regex = new RegExp(query.trim(), "i");
    const filtered = users.filter((user) => regex.test(user.name));

    return res.status(StatusCodes.OK).json({ users: filtered });
  } catch (error) {
    console.error("❌ Error in searchLikedByUsers:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to search liked-by users.");
  }
};

// Controller - getLikedByUsers
const getLikedByUsers = async (req, res) => {
  const { contentId, batch = 1, batchSize = 20 } = req.query;

  if (!contentId || !mongoose.Types.ObjectId.isValid(contentId)) {
    return res
      .status(StatusCodes.BAD_REQUEST)
      .send("Valid content ID is required.");
  }

  try {
    const content = await Content.findById(contentId, { likes: 1 });

    if (!content) {
      return res.status(StatusCodes.NOT_FOUND).send("Content not found.");
    }

    const likes = content.likes || [];
    const b = parseInt(batch);
    const s = parseInt(batchSize);
    const start = (b - 1) * s;
    const end = b * s;
    const batchedUserIds = likes.slice(start, end);

    if (batchedUserIds.length === 0) {
      return res.status(StatusCodes.OK).json({
        users: [],
        total: likes.length,
        hasMore: false,
      });
    }

    // Fetch user profiles in a single batch call
    const users = await fetchMultipleUserProfiles(batchedUserIds);

    return res.status(StatusCodes.OK).json({
      users,
      total: likes.length,
      hasMore: end < likes.length,
    });
  } catch (error) {
    console.error("❌ Error in getLikedByUsers:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to fetch liked-by users.");
  }
};

module.exports = {
  createContent,
  likeContent,
  comment,
  unlikeContent,
  getContent,
  getComments,
  getPopularComments,
  likeAComment,
  unLikeAComment,
  getRandomContent,
  editContent,
  searchContentByTag,
  replyToComment,
  searchContent,
  searchByCommunity,
  generateHashTags,
  searchContentByText,
  getContentForLanding,
  getMultipleContents,
  searchContentFromIds,
  migrateCollectionController,
  uploadMiddleware: upload.single("file"),
  uploadToS3,
  insertNewFields,
  getUserCommunityPosts,
  searchContentQA,
  getLikedByUsers,
  searchLikedByUsers,
};
