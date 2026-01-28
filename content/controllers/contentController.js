const { StatusCodes } = require("http-status-codes");
const {
  fetchUserData,
  fetchClubData,
  fetchCommunityData,
  generateUri,
  scheduleNotification2,
  lemmatize,
  fetchRelatedTags,
  fetchMacbeaseContentFromLastTimeStamp,
  fetchNativeUserData,
  fetchMacbeaseContentFromIds,
  fetchCardsFromIds,
  fetchNativeRandomCommunities,
  fetchNativeRandomClubs,
  fetchRandomCardsForFeed,
  fetchClubsRecommendations,
  fetchCommunitiesRecommendations,
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

const mongoose = require("mongoose");

//Controller 1
const createContent = async (req, res) => {
  try {
    const {
      contentType,
      sendBy,
      url,
      text,
      key,
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
        fields: ["name", "secondaryImg"],
      };
      group = await fetchClubData(club_query);
      params = {
        userName: sender.name,
        userPic: sender.image,
        clubTitle: group.name,
        clubCover: group.secondaryImg,
        userPushToken: sender.pushToken,
      };
    } else if (sendBy === "userCommunity") {
      const community_query = {
        id: belongsTo,
        fields: ["title", "secondaryCover"],
      };
      group = await fetchCommunityData(community_query);
      params = {
        userName: sender.name,
        userPic: sender.image,
        communityTitle: group.title,
        communityCover: group.secondaryCover,
        userPushToken: sender.pushToken,
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
      fields: ["name", "image", "pushToken", "_id"],
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
    };

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

//Controller 13
const loadMoreContent = async (req, res) => {
  try {
    const { lastTimeStamp } = req.query;
    const parsedTimeStamp = lastTimeStamp
      ? new Date(lastTimeStamp)
      : new Date();

    // Fetch Macbease content using the timestamp
    const macbeaseContents = await fetchMacbeaseContentFromLastTimeStamp({
      timeStamp: parsedTimeStamp,
      operator: "lt",
      sort: "desc",
      limit: 12,
    });

    if (macbeaseContents.length === 0) {
      return res.status(StatusCodes.OK).json([]);
    }

    // Determine the timestamp range from macbease contents
    const startRange = macbeaseContents[0].timeStamp;
    const endRange = macbeaseContents[macbeaseContents.length - 1].timeStamp;

    // Fetch user's communities and clubs
    const userInfo = await fetchNativeUserData({
      id: req.user.id,
      fields: ["communitiesPartOf", "clubs"],
      callSign: "universe",
    });

    const belongsToArray = [
      ...new Set([
        ...userInfo.communitiesPartOf.map((c) => c.communityId),
        ...userInfo.clubs.map((c) => c.clubId),
      ]),
    ];

    // Query for older content
    const contents = await Content.find({
      belongsTo: { $in: belongsToArray },
      timeStamp: { $lt: new Date(startRange), $gte: new Date(endRange) },
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

    //getting some random feed
    // const randomFeed = await Content.find(
    //   { belongsTo: { $nin: belongsToArray } },
    //   { vector: 0 }
    // )
    //   .limit(6)
    //   .lean();
    // const modifiedRandomFeed = randomFeed.map((content) => ({
    //   ...content,
    //   commentsNum: content.comments.length,
    //   comments: content.comments.slice(0, 6),
    // }));

    // Combine and sort
    const combinedFeed = [
      ...macbeaseContents,
      ...modifiedContents,
      // ...modifiedRandomFeed,
    ].sort((a, b) => new Date(b.timeStamp) - new Date(a.timeStamp));

    return res.status(StatusCodes.OK).json(combinedFeed);
  } catch (error) {
    console.error("Error in loadMoreContent:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to retrieve content.");
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

//Controller 18
const getEngagementData = async (req, res) => {
  try {
    const { contentIds = [], macbeaseContentIds = [], cardIds = [] } = req.body;

    if (!Array.isArray(contentIds)) {
      return res.status(400).json({ error: "contentIds must be an array." });
    }

    // Run all 3 fetches in parallel (if arrays are non-empty)
    const [contentData, macbeaseContentData, cardsData] = await Promise.all([
      contentIds.length
        ? Content.find({ _id: { $in: contentIds } })
            .select("likes comments")
            .lean()
        : [],
      macbeaseContentIds.length
        ? fetchMacbeaseContentFromIds({
            ids: macbeaseContentIds,
            select: "likes comments",
          })
        : [],
      cardIds.length
        ? fetchCardsFromIds({ ids: cardIds, select: "likedBy" })
        : [],
    ]);

    console.log("cards data", cardsData);

    // Aggregate all into one array
    const allData = [...contentData, ...macbeaseContentData, ...cardsData];

    // Transform into a map of engagement data
    const engagementMap = {};

    for (const item of allData) {
      const { _id } = item;

      if (!_id) continue;

      engagementMap[_id] = {};

      if ("likes" in item || "comments" in item) {
        engagementMap[_id] = {
          likes: item.likes || [],
          comments: (item.comments || []).slice(0, 6),
          commentsNum: (item.comments || []).length,
        };
      } else if ("likedBy" in item) {
        engagementMap[_id] = {
          likedBy: item.likedBy || [],
        };
      }
    }

    return res.json(engagementMap);
  } catch (error) {
    console.error("Error fetching engagement data:", error);
    return res.status(500).json({ error: "Internal server error" });
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
        fetchMacbeaseContentFromLastTimeStamp({
          rangeStart: oneMonthBefore,
          rangeEnd: new Date(cachedEndTimeStamp),
          sample: 3,
        }),
        Content.aggregate(createAggregationPipeline(commContentsMatch)),
        Content.aggregate(createAggregationPipeline(clubContentsMatch)),
        fetchRandomCardsForFeed(),
      ]).then((results) =>
        results.map((r) => (r.status === "fulfilled" ? r.value : [])),
      );

    const result = [...macbeaseContents, ...commContents, ...clubContents];
    return result;
  } catch (error) {
    console.error("Error fetching secondary feed:", error);
    return null;
  }
};

//Controller 20
const getContentForLanding = async (req, res) => {
  try {
    if (req.user.role === "user") {
      const { key, cachedStartTimeStamp, cachedEndTimeStamp, cachedFlagId } =
        req.query;
      let mode = "primary";
      const user = await fetchNativeUserData({
        id: req.user.id,
        fields: [
          "lastActive",
          "name",
          "image",
          "_id",
          "feed",
          "eventFeed",
          "course",
          "role",
          "interests",
          "clubs",
          "communitiesCreated",
          "communitiesPartOf",
          "giftsSend",
          "chatRooms",
          "email",
          "unreadNotice",
          "level",
          "passoutYear",
          "field",
          "incompleteProfile",
          "notifications",
          "shortCuts",
          "incompleteFields",
          "uid",
          "universeMetaData",
        ],
        callSign: "universe",
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
        uid,
        universeMetaData,
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
          fetchNativeRandomCommunities({
            size: 3,
            projection: "content",
            callSign: "universe",
          }),
          fetchNativeRandomClubs({
            size: 3,
            projection: "content",
            callSign: "universe",
          }),
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
          },
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
          Boolean,
        );
        newFeed = [...newFeed, ...communityContents, ...clubContents];
      }
      if (key === "all") {
        let contentIds = feed.slice(0, 12).map((item) => item._id.toString());
        if (cachedFlagId) {
          const matchedIndex = contentIds.findIndex(
            (item) => item === cachedFlagId,
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
                  irrelevanceVote:
                    doc.sendBy === "userCommunity" ? 0 : undefined,
                };
              }
            }
            return null;
          })
          .filter(Boolean);

        await sendKafkaMessage("CLEAR_FEED", "universe", {
          userId: req.user.id,
        });

        if (cachedStartTimeStamp) {
          const macbeaseContents = await fetchMacbeaseContentFromLastTimeStamp({
            timeStamp: cachedStartTimeStamp,
            operator: "gt",
            sort: "desc",
            limit: 12,
          });
          newFeed = [...processedDocs, ...macbeaseContents];
        } else {
          const macbeaseContents = await fetchMacbeaseContentFromLastTimeStamp({
            sort: "desc",
            limit: 12,
          });
          newFeed = [...processedDocs, ...macbeaseContents];
        }
      }
      newFeed = newFeed.sort(
        (a, b) => new Date(b.timeStamp) - new Date(a.timeStamp),
      );
      if (cachedEndTimeStamp && newFeed.length === 0) {
        newFeed = await getSecondaryFeed(cachedEndTimeStamp, clubs);
        mode = "secondary";
      }
      let rand1 = Math.ceil(Math.random() * newFeed.length);
      let rand2 = newFeed.length - rand1;
      if (rand1 === rand2) rand2 += 1;
      if (rand1 > rand2) [rand1, rand2] = [rand2, rand1];
      const cardContents = await fetchRandomCardsForFeed();

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
        const clubIdsPartOf = clubs.map((club) => club.clubId);
        const clubsR = await fetchClubsRecommendations({
          nIds: clubIdsPartOf,
        });
        const commIdspartOf = communitiesPartOf.map((comm) => comm.communityId);
        const communitiesR = await fetchCommunitiesRecommendations({
          nIds: commIdspartOf,
        });

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
            uid,
            universeMetaData,
          },
          clubRecommendations: clubsR,
          communityRecommendations: communitiesR,
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
  } catch (err) {
    console.log("Error in get content for landing :", err);
    return res.status(500).send("Something went wrong");
  }
};

//Controller 21
const getMultipleContents = async (req, res) => {
  try {
    const { ids, select, filters = {} } = req.body;

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
      projectStage = { vector: 0 };
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
        },
      },
      {
        $project: projectStage,
      },
      {
        $sort: { timeStamp: -1 },
      },
    ]);

    return res.status(200).json(contents);
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
  loadMoreContent,
  replyToComment,
  searchContent,
  searchByCommunity,
  generateHashTags,
  getEngagementData,
  searchContentByText,
  getContentForLanding,
  getMultipleContents,
  searchContentFromIds,
  migrateCollectionController,
  uploadMiddleware: upload.single("file"),
  uploadToS3,
  insertNewFields,
};
