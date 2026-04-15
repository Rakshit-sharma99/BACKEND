const { StatusCodes } = require("http-status-codes");
const Community = require("../models/community");
const Admin = require("../models/admin");
const User = require("../models/user");
const Club = require("../models/club");
const schedule = require("node-schedule");
const { mongoose } = require("mongoose");
const { io, redis } = require("../app");
const {
  updateDynamicIsland,
  scheduleNotification2,
  generateUri,
  levelEnum,
  fieldsEnum,
  updateUserIP,
  fetchJoinLinkById,
  fetchBags,
} = require("./utils");

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
const {
  fetchContent,
  fetchMultipleContents,
  searchContentsFromIds,
  searchCardsFromTags,
} = require("./interServiceCalls");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const CommunitySnapshot = require("../models/communitySnapshot");

//Controller 1
const createCommunity = async (req, res) => {
  try {
    const {
      title,
      cover,
      secondaryCover,
      label,
      tag,
      hiddenTags = [],
      universeMetaData,
      scope,
    } = req.body;
    const creatorId = req.user.id;
    const createdOn = new Date();

    const community = await Community.create({
      title,
      cover,
      secondaryCover,
      label,
      tag,
      hiddenTags,
      creatorId,
      creatorPos: req.user.role,
      createdOn,
      members: [creatorId],
      admins: [creatorId],
      uid: req.user.uid,
      universeMetaData,
      scope,
    });

    const shortCut = {
      type: "community",
      id: community._id,
      name: title,
      secondary: secondaryCover,
      native: true,
      metaData: { posts: 0 },
    };

    const communityData = {
      communityId: community._id.toString(),
      bestStreak: 0,
      currentStreak: 0,
      lastPosted: new Date(),
      totalLikes: 0,
      totalPosts: 0,
      rating: 0,
      joined: new Date(),
    };

    const notification = {
      key: "community",
      value: "You have successfully created a community.",
      data: community._id,
    };

    // Update user document in a single query
    await User.findByIdAndUpdate(
      creatorId,
      {
        $push: {
          shortCuts: { $each: [shortCut], $position: 0 }, // Adds shortcut at the beginning
          communitiesCreated: { communityId: community._id },
          communitiesPartOf: communityData,
          unreadNotice: notification,
        },
      },
      { new: true },
    );

    // Emit stats update for the universe
    const communityUniverseId = community.uid || req.user.uid;
    if (communityUniverseId) {
      try {
        await sendKafkaMessage("UNIVERSE_STATS_UPDATE", "multiverse", {
          universeId: communityUniverseId.toString(),
          field: "communities",
          delta: 1,
        });
      } catch (kafkaErr) {
        console.error(
          "Failed to emit community stats update:",
          kafkaErr.message,
        );
      }
    }

    return res.status(StatusCodes.OK).json(community);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Failed to create community" });
  }
};

//Controller 2
const deleteCommunity = async (req, res) => {
  try {
    const { id } = req.body;

    // ✅ Validate input
    if (!id) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("Community id is required.");
    }

    // ✅ Role check
    if (req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to delete a community.");
    }

    // ✅ (Optional but recommended) ownership check
    const community = await Community.findById(id);
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }
    if (community.createdBy.toString() !== req.user.id) {
      return res.status(StatusCodes.FORBIDDEN).send("Not your community.");
    }

    // ✅ Delete
    const deletedCommunity = await Community.findByIdAndDelete(id).lean();

    if (!deletedCommunity) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }

    return res.status(StatusCodes.OK).json({
      deletedCommunity,
    });
  } catch (error) {
    console.error("deleteCommunity error:", error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to delete community.");
  }
};

//Controller 3
const joinAsMember = async (req, res) => {
  try {
    if (!["admin", "user"].includes(req.user.role)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to join the community.");
    }

    const { communityId, linkId } = req.body;
    const userId = mongoose.Types.ObjectId(req.user.id);

    // Fetch community with minimal fields
    const community = await Community.findById(communityId, {
      members: 1,
      entryRules: 1,
      banList: 1,
    }).lean();

    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }

    // Check if user is already a member
    if (community.members.some((member) => member.equals(userId))) {
      return res.status(StatusCodes.OK).send("You are already a member!");
    }

    // Extract user details
    const { level, field, passoutYear } = await User.findById(req.user.id, {
      level: 1,
      field: 1,
      passoutYear: 1,
    });
    const { entryRules } = community;

    // Validate qualification level
    if (entryRules?.level && entryRules.level !== level) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send(
          "Your qualification level does not meet the community's entry requirements.",
        );
    }

    // Validate field of study
    if (entryRules?.field && entryRules.field !== field) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send(
          "Your field of study does not match the community's entry requirements.",
        );
    }

    // Validate passout year
    if (
      entryRules?.passoutYear &&
      entryRules.passoutYear.toString() !== passoutYear
    ) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send(
          `Your passout year does not meet the community's entry requirements.`,
        );
    }

    // Validate inviteOnly mode
    if (entryRules?.isInviteOnly) {
      if (!linkId) {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .send("You must provide a valid link to join this community.");
      }
      const link = await fetchJoinLinkById({ id: linkId });
      if (!link) {
        return res.status(StatusCodes.NOT_FOUND).send("Invite link not found.");
      }
      const canBeUsed = link.canBeUsed(req.user.id);
      if (canBeUsed && link.belongsTo.toString() === communityId.toString()) {
        await sendKafkaMessage("UPDATE_JOINLINK", "joinLink", {
          joinLinkId: linkId,
          userId: req.user.id,
        });
      } else {
        return res
          .status(StatusCodes.BAD_REQUEST)
          .send("You must provide a valid link to join this community.");
      }
    }

    // Validate ban list
    if (
      community?.banList &&
      community.banList.some((id) => id.equals(userId))
    ) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send(`You are banned from joining this community.`);
    }

    // Prepare update operations for atomic updates
    const updateCommunity = {
      $push: { members: userId },
      $inc: { activeMembers: 1 },
    };

    const updateUser = {
      $push: {
        communitiesPartOf: {
          communityId,
          bestStreak: 0,
          currentStreak: 0,
          lastPosted: new Date(),
          totalLikes: 0,
          totalPosts: 0,
          rating: 0,
          joined: new Date(),
        },
        notifications: {
          key: "community",
          value: "You have joined the community.",
          data: communityId,
        },
      },
    };

    // Perform database updates in parallel
    await Promise.all([
      Community.findByIdAndUpdate(communityId, updateCommunity),
      req.user.role === "user"
        ? User.findByIdAndUpdate(req.user.id, updateUser)
        : Promise.resolve(),
    ]);

    return res
      .status(StatusCodes.OK)
      .send("You have successfully joined the community.");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 4
const leaveAsMember = async (req, res) => {
  try {
    const { communityId } = req.body;
    const userId = mongoose.Types.ObjectId(req.user.id);
    const community = await Community.findById(communityId, {
      creatorId: 1,
    }).lean();
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }
    if (community.creatorId.toString() === req.user.id) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are the founder of this community.");
    }

    // Perform atomic updates
    await Community.findByIdAndUpdate(communityId, {
      $pull: { members: userId, admins: userId },
      $inc: { activeMembers: -1 },
      $inc: { rating: -3 },
    });

    if (req.user.role === "user") {
      await User.findByIdAndUpdate(userId, {
        $pull: { communitiesPartOf: { communityId } },
        $push: {
          unreadNotice: {
            key: "community",
            value: "You have successfully left the community.",
            data: communityId,
          },
        },
      });
    }
    return res
      .status(StatusCodes.OK)
      .send("You have successfully left the community.");
  } catch (error) {
    console.error("Error leaving community:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 6
const deleteContent = async (req, res) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    const { contentId, communityId } = req.body;
    let isEligible = false;
    let content = await fetchContent({ contentId });
    if (req.user.role === "admin" || content.idOfSender === req.user.id)
      isEligible = true;
    if (isEligible) {
      Community.findById(communityId, (err, community) => {
        if (err) return console.error(err);
        let contents = community.content;
        contents = contents.filter((item) => item.contentId !== contentId);
        community.content = [];
        community.content.push(...contents);
        if (req.user.role === "user") {
          User.findById(req.user.id, (err, user) => {
            if (err) return console.error(err);
            let contribution = user.communityContribution;
            contribution = contribution.filter((item) => {
              item.contentId !== contentId;
            });
            user.communityContribution = [];
            user.communityContribution.push(...contribution);
            user.save();
          });
        }
        if (req.user.role === "admin") {
          Admin.findById(req.user.id, (err, admin) => {
            if (err) return console.error(err);
            let contribution = admin.communityContribution;
            contribution = contribution.filter(
              (item) => item.contentId !== contentId,
            );
            admin.communityContribution = [];
            admin.communityContribution.push(...contribution);
            admin.save();
          });
        }
        community.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send("Successfully deleted.");
        });
      });
    } else {
      return res
        .status(StatusCodes.OK)
        .send(
          "You are not authorized to delete this content as you are neither creator nor the admin.",
        );
    }
  }
};

//Controller 7
const flag = async (req, res) => {
  try {
    if (req.user.role !== "user" && req.user.role !== "admin") {
      return res
        .status(StatusCodes.UNAUTHORIZED)
        .send("You are not authorized to flag content.");
    }

    const { contentId, communityId } = req.body;

    // Check if the community exists
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }

    // Check if the user is a member of the community
    const isMember = community.members.some((member) =>
      member.equals(req.user.id),
    );

    if (!isMember && req.user.role !== "admin") {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You must be a community member or an admin to flag content.");
    }

    // Use MongoDB's positional operator to find and update the specific content
    const updateResult = await Community.findOneAndUpdate(
      {
        _id: communityId,
        "content.contentId": contentId,
        "content.flaggedBy": { $ne: req.user.id }, // Ensure the user hasn't already flagged
      },
      {
        $inc: { "content.$.irrelevanceVote": 1 },
        $addToSet: { "content.$.flaggedBy": req.user.id },
      },
      { new: true }, // Return the updated document
    );

    if (!updateResult) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("You have already flagged this content or content not found.");
    }

    // Fetch the updated content
    const updatedContent = updateResult.content.find(
      (item) => item.contentId === contentId,
    );

    if (!updatedContent) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Content not found in the community.");
    }

    // Check if the flag threshold is reached
    if (updatedContent.irrelevanceVote > 7 && !updatedContent.flagSaturated) {
      // Mark the content as saturated
      await Community.updateOne(
        { _id: communityId, "content.contentId": contentId },
        { $set: { "content.$.flagSaturated": true } },
      );

      // Notify the community creator
      const creator = await User.findById(community.creatorId);
      if (creator) {
        creator.notifications.push({
          key: "communityUrgent",
          value: "Flag is saturated.",
          data: { communityId, contentId },
        });
        await creator.save();
      }

      // Notify the sender of the flagged content
      const flaggedContent = await fetchContent({ contentId });
      if (flaggedContent) {
        const sender = await User.findById(flaggedContent.idOfSender);
        if (sender) {
          sender.notifications.push({
            key: "communityUrgent",
            value: "Flag is saturated.",
            data: { communityId, contentId },
          });
          await sender.save();
        }
      }
    }

    // Notify the user
    if (req.user.role === "user") {
      const user = await User.findById(req.user.id);
      if (user) {
        user.notifications.push({
          key: "community",
          value: "You have flagged a content.",
          data: { contentId, communityId },
        });
        await user.save();
      }
    }

    return res.status(StatusCodes.OK).send("Successfully flagged the content.");
  } catch (error) {
    console.error("Error:", error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

//Controller 8
const takeDown = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { contentId, communityId } = req.body;
    let content = await fetchContent({ contentId });
    let senderId = content.idOfSender;
    let sendBy = content.sendBy;

    //scheduling clean up
    let threeSec = new Date(Date.now() + 1 * 3 * 1000);
    schedule.scheduleJob(
      `cleanTakenDown_${req.user.id}_${new Date()}`,
      threeSec,
      async () => {
        let members = await Community.findById(communityId, {
          members: 1,
          _id: 0,
        });
        members = members.members;
        let len = members.length;
        for (let i = 0; i < len; i++) {
          let userId = members[i];
          User.findById(userId, (err, user) => {
            if (err) return console.error(err);
            let feed = user.feed;
            feed = feed.filter((item) => item !== contentId);
            user.feed = [];
            user.feed = feed;
            user.save();
          });
        }
      },
    );

    Community.findById(communityId, (err, community) => {
      if (err) return console.error(err);
      if (community.creatorId === req.user.id || req.user.role === "admin") {
        let contents = community.content;
        contents = contents.filter((item) => item.contentId !== contentId);
        community.content = [];
        community.content.push(...contents);
        if (sendBy === "userCommunity") {
          User.findById(senderId, (err, user) => {
            if (err) return console.error(err);
            let contribution = user.communityContribution;
            contribution = contribution.filter(
              (item) => item.contentId !== contentId,
            );
            user.communityContribution = [];
            user.communityContribution.push(...contribution);
            user.notifications.push({
              key: "community",
              value: "Your content has been taken down",
              data: { communityId },
            });
            user.save();
          });
        } else {
          Admin.findById(senderId, (err, admin) => {
            if (err) return console.error(err);
            let contribution = admin.communityContribution;
            contribution = contribution.filter(
              (item) => item.contentId !== contentId,
            );
            admin.communityContribution = [];
            admin.communityContribution.push(...contribution);
            admin.save();
          });
        }
        community.save((err, update) => {
          if (err) return console.error(err);
          return res
            .status(StatusCodes.OK)
            .send("The content has been successfully taken down.");
        });
      } else {
        return res
          .status(StatusCodes.OK)
          .send("You are neither community admin nor Macbease admin.");
      }
    });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to take down the community content.");
  }
};

//Controller 9
const updateStreak = async (req, res) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    const { communityId } = req.body;
    if (req.user.role === "user") {
      User.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId,
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId,
        );
        dataToBeChanged = dataToBeChanged[0];
        let lastPosted = dataToBeChanged.lastPosted;
        let today = new Date();
        const _MS_PER_DAY = 1000 * 60 * 60 * 24;
        const utc1 = Date.UTC(
          lastPosted.getFullYear(),
          lastPosted.getMonth(),
          lastPosted.getDate(),
        );
        const utc2 = Date.UTC(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        );
        const diff = Math.floor((utc2 - utc1) / _MS_PER_DAY);
        if (diff === 1) {
          dataToBeChanged.currentStreak = dataToBeChanged.currentStreak + 1;
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
        } else if (diff > 1) {
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
          dataToBeChanged.currentStreak = 1;
        }
        dataToBeChanged.lastPosted = new Date();
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send("Streak updated");
        });
      });
    } else {
      Admin.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId,
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId,
        );
        dataToBeChanged = dataToBeChanged[0];
        let lastPosted = dataToBeChanged.lastPosted;
        let today = new Date();
        const _MS_PER_DAY = 1000 * 60 * 60 * 24;
        const utc1 = Date.UTC(
          lastPosted.getFullYear(),
          lastPosted.getMonth(),
          lastPosted.getDate(),
        );
        const utc2 = Date.UTC(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
        );
        const diff = Math.floor((utc2 - utc1) / _MS_PER_DAY);
        if (diff === 1) {
          dataToBeChanged.currentStreak = dataToBeChanged.currentStreak + 1;
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
        } else if (diff > 1) {
          if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
            dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
          }
          dataToBeChanged.currentStreak = 1;
        }
        dataToBeChanged.lastPosted = new Date();
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send("Streak updated");
        });
      });
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to update streak.");
  }
};

//Controller 10
const likesAndPosts = async (req, res) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    const { communityId } = req.body;
    if (req.user.role) {
      User.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communityContribution = user.communityContribution;
        let likes = 0;
        let posts = 0;
        communityContribution.map((item) => {
          if (item.communityId === communityId) {
            posts = posts + 1;
          }
        });
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId,
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId,
        );
        dataToBeChanged = dataToBeChanged[0];
        dataToBeChanged.totalLikes = likes;
        dataToBeChanged.totalPosts = posts;
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send("Likes and posts updated");
        });
      });
    } else {
      Admin.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communityContribution = user.communityContribution;
        let likes = 0;
        let posts = 0;
        communityContribution.map((item) => {
          if (item.communityId) {
            posts = posts + 1;
          }
        });
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId,
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId,
        );
        dataToBeChanged = dataToBeChanged[0];
        dataToBeChanged.totalLikes = likes;
        dataToBeChanged.totalPosts = posts;
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send("Likes and posts updated");
        });
      });
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to update number of likes and posts.");
  }
};

//Controller 11
const rating = async (req, res) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    const { communityId } = req.body;
    if (req.user.role === "user") {
      User.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId,
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId,
        );
        dataToBeChanged = dataToBeChanged[0];
        let bestStreak = dataToBeChanged.bestStreak;
        let currentStreak = dataToBeChanged.currentStreak;
        let totalPosts = dataToBeChanged.totalPosts;
        let rating = Math.floor(
          totalPosts * 13.6 + bestStreak * 1.4 + currentStreak * 1.7,
        );
        dataToBeChanged.rating = rating;
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send("Rating updated.");
        });
      });
    } else {
      Admin.findById(req.user.id, (err, user) => {
        if (err) return console.error(err);
        let communitiesPartOf = user.communitiesPartOf;
        let dataToBeChanged = communitiesPartOf.filter(
          (item) => item.communityId === communityId,
        );
        let restOfData = communitiesPartOf.filter(
          (item) => item.communityId !== communityId,
        );
        dataToBeChanged = dataToBeChanged[0];
        let bestStreak = dataToBeChanged.bestStreak;
        let currentStreak = dataToBeChanged.currentStreak;
        let totalPosts = dataToBeChanged.totalPosts;
        let rating = Math.floor(
          totalPosts * 13.6 + bestStreak * 1.4 + currentStreak * 1.7,
        );
        dataToBeChanged.rating = rating;
        restOfData.push(dataToBeChanged);
        communitiesPartOf = restOfData;
        user.communitiesPartOf = [];
        user.communitiesPartOf.push(...communitiesPartOf);
        user.save((err, update) => {
          if (err) return console.error(err);
          return res.status(StatusCodes.OK).send("Rating updated.");
        });
      });
    }
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to update the rating.");
  }
};

//Controller 12
const getAllCommunities = async (req, res) => {
  try {
    const batch = parseInt(req.query.batch) || 1; // default to first batch
    const batchSize = parseInt(req.query.batchSize) || 12; // default batch size
    const uid = req.query.uid?.toString().trim();
    const skipCount = (batch - 1) * batchSize;

    const community = await Community.aggregate([
      ...(uid ? [{ $match: { uid } }] : []),
      {
        $match: {
          $or: [
            { "entryRules.isInviteOnly": { $exists: false } },
            { "entryRules.isInviteOnly": false },
          ],
        },
      },
      {
        $project: {
          secondaryCover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          hiddenTags: 1,
          membersCount: { $size: "$members" },
          top5Members: { $slice: ["$members", 5] },
          founderId: { $toObjectId: "$creatorId" },
          isMember: { $in: [mongoose.Types.ObjectId(req.user.id), "$members"] },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "top5Members",
          foreignField: "_id",
          as: "top5Profiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "founderId",
          foreignField: "_id",
          as: "foundersDetails",
        },
      },
      {
        $project: {
          secondaryCover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          hiddenTags: 1,
          membersCount: 1,
          isMember: 1,
          top5Profiles: {
            $map: {
              input: "$top5Profiles",
              as: "profile",
              in: {
                id: "$$profile._id",
                name: "$$profile.name",
                img: "$$profile.image",
                pushToken: "$$profile.pushToken",
              },
            },
          },
          foundersDetails: {
            $arrayElemAt: [
              {
                $map: {
                  input: "$foundersDetails",
                  as: "profile",
                  in: {
                    id: "$$profile._id",
                    name: "$$profile.name",
                    img: "$$profile.image",
                    pushToken: "$$profile.pushToken",
                    course: "$$profile.course",
                  },
                },
              },
              0,
            ],
          },
        },
      },
      { $skip: skipCount },
      { $limit: batchSize },
    ]);

    return res.status(StatusCodes.OK).json(community);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching the communities.");
  }
};

//Controller 13
const getCommunityById = async (req, res) => {
  try {
    const { id } = req.query;
    const community = await Community.findById(id, {
      title: 1,
      secondaryCover: 1,
    });
    if (community) {
      return res.status(StatusCodes.OK).json(community);
    } else {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }
  } catch (err) {
    console.log("Error getting community by id:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong");
  }
};

//Controller 14
const getCommunityByTag = async (req, res) => {
  try {
    const { tag } = req.query;

    // ✅ Validate input
    if (!tag || typeof tag !== "string") {
      return res.status(StatusCodes.BAD_REQUEST).send("Valid tag is required.");
    }

    // ✅ Escape regex (prevent injection/ReDoS)
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(escapedTag, "i");

    // ✅ Fetch communities
    const communities = await Community.find(
      { tag: regex },
      {
        secondaryCover: 1,
        title: 1,
        tag: 1,
        activeMembers: 1,
        label: 1,
      },
    ).lean();

    // ✅ Non-blocking lastActive update
    const updateLastActive = async () => {
      try {
        if (req.user.role === "user") {
          await User.findByIdAndUpdate(req.user.id, {
            lastActive: new Date(),
          });
        } else if (req.user.role === "admin") {
          await Admin.findByIdAndUpdate(req.user.id, {
            lastActive: new Date(),
          });
        }
      } catch (err) {
        console.error("lastActive update failed:", err);
      }
    };

    updateLastActive(); // fire & forget

    return res.status(StatusCodes.OK).json(communities);
  } catch (error) {
    console.error("getCommunityByTag error:", error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to fetch communities.");
  }
};

//Controller 15
const isMember = async (req, res) => {
  try {
    const { communityId } = req.query;
    const userId = req.user.id;

    if (!communityId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("communityId is required.");
    }

    if (!["user", "admin"].includes(req.user.role)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to access this resource.");
    }

    const Model = req.user.role === "user" ? User : Admin;

    const entity = await Model.findById(userId, {
      communitiesPartOf: 1,
    }).lean();

    if (!entity) {
      return res.status(StatusCodes.NOT_FOUND).send("User/Admin not found.");
    }

    const communities = entity.communitiesPartOf || [];

    const isMember = communities.some(
      (item) => item.communityId?.toString() === communityId,
    );

    if (isMember) {
      return res.status(StatusCodes.OK).send("You are member.");
    } else {
      return res.status(StatusCodes.OK).send("You are not a member.");
    }
  } catch (error) {
    console.error("isMember error:", error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to check membership.");
  }
};

//Controller 16
const getContentOfACommunity = async (req, res) => {
  try {
    const { communityId } = req.query;

    // ✅ Validate input
    if (!communityId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("communityId is required.");
    }

    // ✅ Fetch community with content
    const community = await Community.findById(communityId, {
      content: 1,
    }).lean();

    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }

    const contents = community.content || [];

    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error("getContentOfACommunity error:", error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to fetch community content.");
  }
};

//Controller 17
const getCommunitiesPartOf = async (req, res) => {
  try {
    if (req.user.role === "user") {
      const user = await User.findById(req.user.id, {
        communitiesPartOf: 1,
        clubs: 1,
        _id: 0,
      }).lean();

      const communityIds = user.communitiesPartOf.map((c) => c.communityId);
      const clubIds = user.clubs.map((c) => c.clubId);

      const [communities, clubs] = await Promise.all([
        Community.find(
          { _id: { $in: communityIds } },
          { secondaryCover: 1, title: 1, tag: 1, activeMembers: 1 },
        ).lean(),
        Club.find(
          { _id: { $in: clubIds } },
          { name: 1, secondaryImg: 1, motto: 1, tags: 1 },
        ).lean(),
      ]);

      const finalDataCommunity = user.communitiesPartOf
        .map((c) => {
          const community = communities.find(
            (comm) => comm._id.toString() === c.communityId.toString(),
          );
          return community ? { ...c, ...community } : null;
        })
        .filter(Boolean); // Filters out null values

      const finalDataClub = user.clubs
        .map((c) => {
          const club = clubs.find(
            (club) => club._id.toString() === c.clubId.toString(),
          );
          return club ? { ...c, ...club } : null;
        })
        .filter(Boolean); // Filters out null values

      return res
        .status(StatusCodes.OK)
        .json({ finalDataCommunity, finalDataClub });
    }
  } catch (error) {
    console.error("Error fetching communities:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong" });
  }
};

//Controller 18
const getLatestContent = async (req, res) => {
  try {
    const { communityId } = req.query;
    const userId = req.user.id;

    if (!communityId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("communityId is required.");
    }

    if (!["user", "admin"].includes(req.user.role)) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to access this resource.");
    }

    const Model = req.user.role === "user" ? User : Admin;

    const entity = await Model.findById(userId, {
      lastActive: 1,
    }).lean();

    if (!entity) {
      return res.status(StatusCodes.NOT_FOUND).send("User/Admin not found.");
    }

    const lastActive = new Date(entity.lastActive || 0);

    const community = await Community.findById(communityId, {
      content: 1,
    }).lean();

    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }

    const contents = community.content || [];

    const arr = contents.filter(
      (item) => new Date(item.timeStamp) > lastActive,
    );

    return res.status(StatusCodes.OK).json(arr);
  } catch (error) {
    console.error("getLatestContent error:", error);

    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to fetch latest content.");
  }
};

//Controller 19
const getCommunityProfile = async (req, res) => {
  const { communityId } = req.query;
  const community = await Community.findById(communityId, {
    title: 1,
    secondaryCover: 1,
    _id: 0,
    cover: 1,
    label: 1,
    tag: 1,
    hiddenTags: 1,
  });
  return res.status(StatusCodes.OK).json(community);
};

//Controller 20
const getUserProfile = async (req, res) => {
  const { userId } = req.query;
  if (req.user.role === "user") {
    let user = await User.findById(userId, {
      image: 1,
      name: 1,
      _id: 0,
      pushToken: 1,
      deactivated: 1,
    });
    return res.status(StatusCodes.OK).json(user);
  } else if (req.user.role === "admin") {
    let user = await Admin.findById(userId, { image: 1, name: 1, _id: 0 });
    return res.status(StatusCodes.OK).json(user);
  }
};

//Controller 21
const getLikeAndFlagStatus = async (req, res) => {
  if (req.user.role === "admin" || req.user.role === "user") {
    const { contentId, communityId } = req.query;
    const content = await fetchContent({ contentId, select: "likes" });
    let liked = content.likes.includes(req.user.id);
    const communityData = await Community.findById(communityId, {
      content: 1,
      _id: 0,
    });
    let concernedData = communityData.content.find(
      (item) => item.contentId === contentId,
    );
    let flaggedBy = concernedData.flaggedBy;
    let flagged = flaggedBy.includes(req.user.id);
    return res.status(StatusCodes.OK).json({ liked, flagged });
  } else {
    return res
      .status(StatusCodes.OK)
      .send("You are not authorized to get the like and flag status. ");
  }
};

//Controller 22
const getBasicCommunityDataFromId = async (req, res) => {
  const { communityId } = req.query;
  const community = await Community.findById(communityId, {
    secondaryCover: 1,
    title: 1,
    tag: 1,
    activeMembers: 1,
  });
  return res.status(StatusCodes.OK).json(community);
};

//Controller 23
const getUserContributionCover = async (req, res) => {
  try {
    const { communityId } = req.query;

    const { communitiesPartOf, name, image } = await User.findById(
      req.user.id,
      {
        communitiesPartOf: 1,
        _id: 0,
        name: 1,
        image: 1,
      },
    );
    let user = communitiesPartOf.find(
      (item) => item.communityId.toString() === communityId.toString(),
    );
    return res.status(StatusCodes.OK).json({ user, name, image });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

//Controller 24
const getContribution = async (req, res) => {
  try {
    const { communityId, batch } = req.query;
    console.log("getContribution called with:", {
      communityId,
      batch,
      userId: req.user.id,
    });
    const user = await User.findOne(
      { _id: req.user.id },
      { communityContribution: 1, _id: 0 },
    ).lean();

    if (!user) {
      console.log("User not found for ID:", req.user.id);
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found" });
    }

    let communityContribution = user.communityContribution || [];
    console.log(
      "Total communityContribution length:",
      communityContribution.length,
    );

    if (batch) {
      communityContribution = communityContribution.slice(
        (batch - 1) * 50,
        batch * 50,
      );
      console.log(
        "Sliced communityContribution length (batch:",
        batch,
        "):",
        communityContribution.length,
      );
    }
    const relevantIds = communityContribution
      .filter((item) => item.communityId === communityId)
      .map((item) => mongoose.Types.ObjectId(item.contentId));

    console.log(
      "Relevant IDs length for communityId:",
      communityId,
      "is:",
      relevantIds.length,
    );

    if (relevantIds.length === 0) {
      return res.status(StatusCodes.OK).json([]);
    }
    const contents = await fetchMultipleContents({ ids: relevantIds });
    return res.status(StatusCodes.OK).json(contents);
  } catch (error) {
    console.error("Error in getContribution:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Internal Server Error" });
  }
};

//Controller 25
const getAllTags = async (req, res) => {
  const communities = await Community.find({}, { tag: 1, _id: 0 });
  return res.status(StatusCodes.OK).json(communities);
};

//Controller 26
const getLikedPosts = async (req, res) => {
  let user = await User.findById(req.user.id, { likedContents: 1, _id: 0 });
  user = user.likedContents;
  let data = [];
  for (let i = 0; i < user.length; i++) {
    let likedContent = user[i];
    if (likedContent.type === "community") {
      data.push(likedContent.contentId);
    }
  }
  return res.status(StatusCodes.OK).json(data);
};

//Controller 27
const getFastFeed = async (req, res) => {
  if (req.user.role === "user") {
    const user = await User.findById(req.user.id, {
      communitiesPartOf: 1,
      lastActive: 1,
      _id: 0,
    });
    let communities = user.communitiesPartOf;
    let lastActive = user.lastActive;
    lastActive = new Date(lastActive);
    let len = communities.length;
    let totalContent = [];
    for (let i = 0; i < len; i++) {
      let communityId = communities[i].communityId;
      let contents = await Community.findById(communityId, {
        content: 1,
        _id: 0,
      });
      contents = contents.content;
      totalContent.push(...contents);
    }
    // let finalContent = [];
    // for (let j = 0; j < totalContent.length; j++) {
    //     let content = totalContent[j];
    //     if (lastActive - new Date(content.timeStamp) < 0) {
    //         finalContent.push(content)
    //     }
    // }
    let finalContent = totalContent;
    let actualContent = [];
    for (let k = 0; k < finalContent.length; k++) {
      let contentId = finalContent[k].contentId;
      let irrelevanceVote = finalContent[k].irrelevanceVote;
      let actualData = await fetchContent({ contentId });
      let data = { irrelevanceVote, ...actualData };
      actualContent.push(data);
    }
    let finishedContent = [];
    for (let l = 0; l < actualContent.length; l++) {
      let data = actualContent[l];
      let userId = data.idOfSender;
      let communityId = data.belongsTo;
      let user = await User.findById(userId, { image: 1, name: 1, _id: 0 });
      let community = await Community.findById(communityId, {
        title: 1,
        secondaryCover: 1,
        _id: 0,
      });
      let withPicData = {
        ...data,
        userName: user.name,
        userPic: user.image,
        communityTitle: community.title,
        communityCover: community.secondaryCover,
      };
      finishedContent.push(withPicData);
    }

    return res.status(StatusCodes.OK).json({ finishedContent, lastActive });
  }
};

//Controller 28
const getFastNativeFeed = async (req, res) => {
  if (req.user.role === "user" || req.user.role === "admin") {
    const { communityId } = req.query;
    try {
      const community = await Community.findById(communityId, {
        title: 1,
        secondaryCover: 1,
        content: 1,
        label: 1,
        createdOn: 1,
        activeMembers: 1,
        creatorId: 1,
        cover: 1,
        members: 1,
        onlineMembers: 1,
        admins: 1,
        postPermission: 1,
        shareLinkPermission: 1,
        entryRules: 1,
        universeMetaData: 1,
        uid: 1,
      });
      if (!community) {
        return res.status(StatusCodes.NOT_FOUND).send("Community not found");
      }
      const [creatorDetail, contents, userDetail, adminsDetails] =
        await Promise.all([
          User.findById(community.creatorId, {
            name: 1,
            image: 1,
            pushToken: 1,
          }),
          Promise.resolve(community.content.slice(0, 6)),
          User.findById(req.user.id, {
            name: 1,
            image: 1,
            pushToken: 1,
          }),
          User.aggregate([
            { $match: { _id: { $in: community.admins } } },
            {
              $project: {
                name: 1,
                image: 1,
                pushToken: 1,
                profession: 1,
                course: 1,
              },
            },
          ]),
        ]);
      if (
        !community.onlineMembers.includes(mongoose.Types.ObjectId(req.user.id))
      ) {
        community.onlineMembers.push(mongoose.Types.ObjectId(req.user.id));
        await community.save();
        io.emit(`communityOnlineStatusUpdated_${communityId}`, {
          status: 1,
          metaData: userDetail,
        });
      }
      const isMember = community.members.includes(req.user.id);
      const isCreator = community.creatorId.toString() === req.user.id;
      const contentIds = contents.map((contentItem) => contentItem.contentId);
      let actualContentDocs = await fetchMultipleContents({
        ids: contentIds,
      });
      actualContentDocs = actualContentDocs?.reverse() || [];
      let actualContent = actualContentDocs.map((contentDoc) => {
        const matchedContent = contents.find(
          (c) => c.contentId === contentDoc._id.toString(),
        );
        const doc = contentDoc;

        return {
          ...doc,
          irrelevanceVote: matchedContent.irrelevanceVote,
          flaggedBy: matchedContent.flaggedBy,
          commentsNum:
            doc.commentsNum !== undefined
              ? doc.commentsNum
              : doc.comments.length,
          comments: doc.comments.slice(0, 6),
        };
      });

      const now = Date.now();
      const pollIds = await redis.zrangebyscore(
        `community:${communityId}:polls`,
        now,
        "+inf",
      );

      if (pollIds.length) {
        let polls = await Promise.all(
          pollIds.map(async (pollId) => {
            const pollData = await redis.get(pollId);
            return pollData ? JSON.parse(pollData) : null;
          }),
        );
        polls = polls.filter((poll) => poll !== null);
        actualContent = [...actualContent, ...polls];
      }

      const communityDetail = {
        createdOn: community.createdOn,
        label: community.label,
        members: community.members.length,
        cover: community.cover,
        name: community.title,
        logo: community.secondaryCover,
      };
      console.log({
        universeMetaData: community.universeMetaData,
        uid: community.uid,
      });
      return res.status(StatusCodes.OK).json({
        finishedContent: actualContent.reverse(),
        creatorDetail,
        communityDetail,
        isMember,
        isCreator,
        onlineMembers: community.onlineMembers.length,
        adminsDetails,
        adminIds: community.admins,
        postPermission: community.postPermission,
        shareLinkPermission: community.shareLinkPermission,
        entryRules: community.entryRules,
        universeMetaData: community.universeMetaData,
        uid: community.uid,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(StatusCodes.INTERNAL_SERVER_ERROR)
        .send("Something went wrong!");
    }
  }
};

const getBatchedContent = async (req, res) => {
  const { communityId, batch, batchSize, remedy } = req.query;
  try {
    const community = await Community.findById(communityId, { content: 1 });
    let content = [];
    let finalContent = [];
    if (batch && batchSize) {
      content = community.content.slice(
        (batch - 1) * batchSize,
        batch * batchSize,
      );
      if (remedy) {
        content = content.slice(remedy);
      }
    } else {
      content = community.content;
    }
    const len = content.length;
    for (let i = 0; i < len; i++) {
      const id = content[i].contentId;
      let doc = await fetchContent({ contentId: id });
      if (doc) {
        let commentsNum =
          doc.commentsNum !== undefined ? doc.commentsNum : doc.comments.length;
        doc.comments = doc.comments.slice(0, 6);
        let point = {
          ...doc,
          irrelevanceVote: content[i].irrelevanceVote,
          flaggedBy: content[i].flaggedBy,
          commentsNum,
        };
        finalContent.push(point);
      }
    }
    return res.status(StatusCodes.OK).json({ finalContent });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).send("Something went wrong!");
  }
};

//helper function to check for bonuses
const giveBonusIP = (streakDays) => {
  let bonusPoints = 0;
  if (streakDays === 1) bonusPoints += 2;
  if (streakDays === 7) bonusPoints += 2;
  if (streakDays === 30) bonusPoints += 5;
  if (streakDays === 50) bonusPoints += 10;
  if (streakDays === 100) bonusPoints += 20;
  return bonusPoints;
};

//Secondary actions for community post
const secondaryActionsForPost = async (
  communityId,
  contentType,
  contentId,
  userId,
) => {
  const threeSec = new Date(Date.now() + 5 * 1000);
  schedule.scheduleJob(
    `feedCommunity_${userId}_${threeSec}_${contentId}`,
    threeSec,
    async () => {
      const community = await Community.findById(communityId, {
        members: 1,
        muted: 1,
        seeLessFeed: 1,
        title: 1,
        pinnedBy: 1,
        secondaryCover: 1,
      });
      if (!community) {
        return console.error("Community not found");
      }
      await updateDynamicIsland(community.pinnedBy, communityId, "posts", true);
      let { members } = community;
      let memebersForPushToken = members;
      memebersForPushToken = memebersForPushToken.filter(
        (item, index) => !community.muted.includes(item.toString()),
      );
      const users = await User.find(
        { _id: { $in: memebersForPushToken } },
        { pushToken: 1 },
      );
      const tokens = users.map((item) => item.pushToken);
      if (contentType === "text") {
        members = members.filter(
          (item, index) => !community.seeLessFeed.includes(item.toString()),
        );
      }
      const point = { _id: mongoose.Types.ObjectId(contentId) };
      if (contentType !== "text") {
        await User.updateMany(
          { _id: { $in: members } },
          {
            $push: { feed: { $each: [point], $position: 0 } },
          },
        );
      }
      const contentMetaData = await fetchContent({
        contentId,
        select: "url,text,contentType",
      });
      const user = await User.findById(userId, {
        communityContribution: 1,
        communitiesPartOf: 1,
        name: 1,
      });
      // user.communityContribution.push({ contentId, communityId });

      if (contentMetaData.contentType === "image") {
        const img = await generateUri(contentMetaData.url.split("@")[0]);
        scheduleNotification2({
          pushToken: tokens,
          title: `${user.name} posted in ${community.title}`,
          body: `${contentMetaData.text.substring(0, 50)}...`,
          image: img,
          url: `https://macbease.com/app/community/${community._id}`,
        });
      } else {
        scheduleNotification2({
          pushToken: tokens,
          title: `${user.name} posted in ${community.title}`,
          body: `${contentMetaData.text.substring(0, 50)}...`,
          url: `https://macbease.com/app/community/${community._id}`,
        });
      }

      //logic for updating streak
      let communitiesPartOf = user.communitiesPartOf;

      // Find the community object to update
      let dataToBeChanged = communitiesPartOf.find(
        (item) => item.communityId === communityId,
      );

      if (!dataToBeChanged) return; // Ensure the community exists

      let today = new Date();
      let lastPosted = dataToBeChanged.lastPosted
        ? new Date(dataToBeChanged.lastPosted)
        : new Date(0);

      const _MS_PER_DAY = 1000 * 60 * 60 * 24;
      const diff = Math.floor(
        (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
          Date.UTC(
            lastPosted.getFullYear(),
            lastPosted.getMonth(),
            lastPosted.getDate(),
          )) /
          _MS_PER_DAY,
      );

      if (diff < 0) {
        console.error("Invalid lastPosted date detected.");
        return;
      }

      // Update streaks
      if (diff === 1 || dataToBeChanged.totalPosts === 0) {
        dataToBeChanged.currentStreak += 1;
        // Rewarding IP for maintainign streak
        const reward = 1 + giveBonusIP(dataToBeChanged.currentStreak);
        dataToBeChanged.rating += reward;
        await updateUserIP({
          userId,
          ipChange: reward, // Accepts both negative and positive values
          c_source: "user",
          d_source: "system",
          c_ref: userId,
          description: "Credited for maintaining contribution streak!",
          noEmissions: true, // preventing generic credit popover for displaying streak counter
        });
        //emission for streak counter
        setTimeout(() => {
          io.emit(`streakUpdate_${communityId}_${userId}`, {
            streak: dataToBeChanged.currentStreak,
            ip: reward,
          });
        }, 6000);
      } else if (diff > 1) {
        dataToBeChanged.currentStreak = 1;
      }

      // Ensure best streak is updated
      if (dataToBeChanged.currentStreak > dataToBeChanged.bestStreak) {
        dataToBeChanged.bestStreak = dataToBeChanged.currentStreak;
      }

      // If it's the first post ever, initialize streaks
      if (
        dataToBeChanged.currentStreak === 0 &&
        dataToBeChanged.bestStreak === 0
      ) {
        dataToBeChanged.currentStreak = 1;
        dataToBeChanged.bestStreak = 1;
      }

      // Update post count and last posted date
      dataToBeChanged.lastPosted = today;
      dataToBeChanged.totalPosts += 1;

      user.markModified("communitiesPartOf");
      user.markModified("communityContribution");

      // Save changes
      await User.findByIdAndUpdate(user._id, {
        communitiesPartOf: user.communitiesPartOf,
        communityContribution: user.communityContribution,
      });
    },
  );
};

//Controller 29
const post = async (req, res) => {
  const { contentId, communityId, contentType } = req.body;
  try {
    if (!contentId) {
      return res.status(StatusCodes.NOT_FOUND).send("Content id missing.");
    }
    const community = await Community.findById(communityId, {
      content: 1,
      members: 1,
    });
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found");
    }
    const isMember = community.members.includes(req.user.id);
    if (!isMember) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You must join the community first.");
    }
    if (!contentType) {
      const content = await fetchContent({ contentId, select: "contentType" });
      community.content.unshift({
        contentId,
        irrelevanceVote: 0,
        flagSaturated: false,
        flaggedBy: [],
        timeStamp: new Date(),
        type: content.contentType,
      });
    } else {
      community.content.unshift({
        contentId,
        irrelevanceVote: 0,
        flagSaturated: false,
        flaggedBy: [],
        timeStamp: new Date(),
        type: contentType,
      });
    }
    secondaryActionsForPost(communityId, contentType, contentId, req.user.id);

    await community.save();

    // Publish user.activity event for SERE
    try {
      sendKafkaMessage("USER_ACTIVITY", "user", {
        userId: req.user.id,
        uid: req.user.uid,
        activityType: "first_post",
        ref: contentId,
      });
    } catch (kafkaErr) {
      console.error("user.activity publish failed:", kafkaErr.message);
    }

    const contentDoc = await fetchContent({ contentId });
    const finalObj = { ...contentDoc, irrelevanceVote: 0, commentsNum: 0 };
    io.emit(`communityContentUpdated_${communityId}`, {
      communityId,
      content: finalObj,
    });
    return res.status(StatusCodes.OK).send("Successfully posted.");
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while posting community pin.");
  }
};

//Controller 30
const editCommunityProfile = async (req, res) => {
  try {
    const { communityId, data } = req.body;

    if (!communityId || !data || typeof data !== "object") {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("communityId and valid data object are required.");
    }

    const allowedFields = ["title", "cover", "secondaryCover", "tag", "label"];

    const updateData = {};
    for (const key of allowedFields) {
      if (data[key] !== undefined) {
        updateData[key] = data[key];
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .send("No valid fields provided for update.");
    }

    const updatedCommunity = await Community.findByIdAndUpdate(
      communityId,
      { $set: updateData },
      { runValidators: true },
    );

    if (!updatedCommunity) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }

    return res.status(StatusCodes.OK).send("Successfully updated!");
  } catch (error) {
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to update community.");
  }
};

//Controller 31
const getAllContributionOfUser = async (req, res) => {
  const { id, batch, batchSize } = req.query;
  const skip = (batch - 1) * batchSize;
  try {
    const user = await User.findById(id, {
      communityContribution: 1,
    }).lean();
    if (!user || !user.communityContribution) {
      return res.status(StatusCodes.OK).json([]);
    }
    const reversedContributions = user.communityContribution.reverse();
    const contributionsBatch = reversedContributions.slice(
      skip,
      skip + parseInt(batchSize),
    );
    const relevantIds = contributionsBatch.map((item) =>
      mongoose.Types.ObjectId(item.contentId),
    );
    const contributions = await fetchMultipleContents({ ids: relevantIds });
    return res.status(StatusCodes.OK).json(contributions);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Error fetching club contributions.");
  }
};

//Controller 32
const getAllMembers = async (req, res) => {
  try {
    const { id, page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const community = await Community.findById(id, { members: 1 });
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found");
    }

    const totalMembers = community.members.length;

    const members = await Community.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(id) } },
      { $unwind: "$members" },
      { $skip: skip },
      { $limit: parseInt(limit) },
      {
        $lookup: {
          from: "users",
          localField: "members",
          foreignField: "_id",
          as: "memberDetails",
        },
      },
      { $unwind: "$memberDetails" },
      {
        $project: {
          _id: "$memberDetails._id",
          name: "$memberDetails.name",
          image: "$memberDetails.image",
          course: "$memberDetails.course",
          reg: "$memberDetails.reg",
          pushToken: "$memberDetails.pushToken",
          profession: "$memberDetails.profession",
          universeMetaData: "$memberDetails.universeMetaData",
        },
      },
    ]);

    return res.status(StatusCodes.OK).json({ members, totalMembers });
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong");
  }
};

//Controller to get all the community admins
const getAllAdmins = async (req, res) => {
  try {
    const { id } = req.query;

    const communityWithAdmins = await Community.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(id) } },
      { $unwind: "$admins" },
      {
        $lookup: {
          from: "users",
          localField: "admins",
          foreignField: "_id",
          as: "memberDetails",
        },
      },
      { $unwind: "$memberDetails" },
      {
        $project: {
          _id: "$memberDetails._id",
          name: "$memberDetails.name",
          image: "$memberDetails.image",
          course: "$memberDetails.course",
          reg: "$memberDetails.reg",
          pushToken: "$memberDetails.pushToken",
          profession: "$memberDetails.profession",
        },
      },
    ]);
    if (!communityWithAdmins.length) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Community not found or no members");
    }
    return res.status(StatusCodes.OK).json(communityWithAdmins);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong");
  }
};

//Controller 33
const getAllRelatedSocialGroups = async (req, res) => {
  try {
    const { query } = req.query;
    const bags = await fetchBags({ query });
    const finalData = bags.reduce((acc, bag) => acc.concat(bag.keyWords), []);
    if (finalData.length === 0) {
      finalData.push(query);
    }

    console.log("final data", finalData);

    const regexPatterns = finalData.map((tag) => new RegExp(tag, "i"));
    const queryRegex = new RegExp(query, "i");

    const [communities, clubs] = await Promise.all([
      Community.aggregate([
        {
          $match: {
            $or: [{ tag: { $in: regexPatterns } }, { title: queryRegex }],
          },
        },
        {
          $project: {
            secondaryCover: 1,
            label: 1,
            activeMembers: 1,
            title: 1,
            tag: 1,
            membersCount: { $size: "$members" },
            top5Members: { $slice: ["$members", 5] },
            founderId: { $toObjectId: "$creatorId" },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "top5Members",
            foreignField: "_id",
            as: "top5Profiles",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "founderId",
            foreignField: "_id",
            as: "foundersDetails",
          },
        },
        {
          $project: {
            secondaryCover: 1,
            label: 1,
            activeMembers: 1,
            title: 1,
            tag: 1,
            membersCount: 1,
            top5Profiles: {
              $map: {
                input: "$top5Profiles",
                as: "profile",
                in: {
                  id: "$$profile._id",
                  name: "$$profile.name",
                  img: "$$profile.image",
                  pushToken: "$$profile.pushToken",
                },
              },
            },
            foundersDetails: {
              $arrayElemAt: [
                {
                  $map: {
                    input: "$foundersDetails",
                    as: "profile",
                    in: {
                      id: "$$profile._id",
                      name: "$$profile.name",
                      img: "$$profile.image",
                      pushToken: "$$profile.pushToken",
                      course: "$$profile.course",
                    },
                  },
                },
                0,
              ],
            },
          },
        },
      ]),
      Club.aggregate([
        {
          $match: {
            $or: [{ tags: { $in: regexPatterns } }, { name: queryRegex }],
          },
        },
        {
          $project: {
            secondaryImg: 1,
            name: 1,
            tags: 1,
            motto: 1,
            mainAdmin: 1,
            membersCount: { $size: "$members" },
            top5Members: { $slice: ["$members", 5] },
            founderId: { $toObjectId: "$mainAdmin" },
          },
        },
        {
          $addFields: {
            top5Members: {
              $map: {
                input: "$top5Members",
                as: "memberId",
                in: { $toObjectId: "$$memberId" },
              },
            },
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "top5Members",
            foreignField: "_id",
            as: "top5Profiles",
          },
        },
        {
          $lookup: {
            from: "users",
            localField: "founderId",
            foreignField: "_id",
            as: "foundersDetails",
          },
        },
        {
          $project: {
            secondaryImg: 1,
            name: 1,
            tags: 1,
            motto: 1,
            membersCount: 1,
            top5Profiles: {
              $map: {
                input: "$top5Profiles",
                as: "profile",
                in: {
                  id: "$$profile._id",
                  name: "$$profile.name",
                  img: "$$profile.image",
                  pushToken: "$$profile.pushToken",
                },
              },
            },
            foundersDetails: {
              $arrayElemAt: [
                {
                  $map: {
                    input: "$foundersDetails",
                    as: "profile",
                    in: {
                      id: "$$profile._id",
                      name: "$$profile.name",
                      img: "$$profile.image",
                      pushToken: "$$profile.pushToken",
                      course: "$$profile.course",
                    },
                  },
                },
                0,
              ],
            },
          },
        },
      ]),
    ]);
    const cards = await searchCardsFromTags(finalData);
    return res.status(StatusCodes.OK).json({ clubs, communities, cards });
  } catch (error) {
    console.error("Error fetching social groups:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Failed to retrieve social groups.");
  }
};

//Controller 34
const getOthersContributionCover = async (req, res) => {
  try {
    const { userId, communityId } = req.query;
    const user = await User.findById(userId, {
      passoutYear: 1,
      communitiesPartOf: 1,
      _id: 0,
    });
    const communities = user.communitiesPartOf;
    const len = communities.length;
    let dataPoint = { points: "", contributions: "", joining: "" };
    let commArr = [];
    for (let i = 0; i < len; i++) {
      const commId = communities[i].communityId;
      if (commId === communityId) {
        dataPoint.points = communities[i].rating;
        dataPoint.contributions = communities[i].totalPosts;
        dataPoint.joining = communities[i].joined;
      } else {
        const comm = await Community.findById(commId, { cover: 1, title: 1 });
        if (comm) {
          const obj = {
            title: comm.title,
            secondaryCover: comm.cover,
            _id: commId,
          };
          commArr.push(obj);
        }
      }
    }
    return res.status(StatusCodes.OK).json({
      passoutYear: user.passoutYear,
      stats: dataPoint,
      partOf: commArr,
    });
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

function formatDateToMonthYear(dateString) {
  const date = new Date(dateString);
  const options = { year: "numeric", month: "short" };
  return date.toLocaleString("en-US", options);
}

const getMediaAndDocs = async (req, res) => {
  const { communityId, key, processedPins, lastProcessedTimeStamp } = req.query;
  try {
    const commData = await Community.findById(communityId, { content: 1 });
    let contents = commData.content;
    if (processedPins) {
      contents = contents.slice(processedPins);
    }
    const keys = key.split("%");
    let i = 0;
    let numMonths = -1;
    let month = null;
    let arr = [];
    while (i < contents.length) {
      const contentId = contents[i].contentId;
      if (
        keys.includes(contents[i].type) &&
        new Date(contents[i].timeStamp) < new Date(lastProcessedTimeStamp)
      ) {
        const thisMonth = formatDateToMonthYear(contents[i].timeStamp);
        if (thisMonth !== month) {
          numMonths = numMonths + 1;
          month = thisMonth;
        }
        if (numMonths < 2) {
          if (arr[numMonths]) {
            arr[numMonths] = [
              ...arr[numMonths],
              mongoose.Types.ObjectId(contentId),
            ];
          } else {
            arr[numMonths] = [mongoose.Types.ObjectId(contentId)];
          }
        } else {
          break;
        }
      }
      i = i + 1;
    }
    let finalData = [];
    for (let j = 0; j < arr.length; j++) {
      const relevantContent = await fetchMultipleContents({
        ids: arr[j],
        select: "url,timeStamp,metaData,params,contentType,c_url",
      });

      finalData[j] = relevantContent;
    }

    return res
      .status(StatusCodes.OK)
      .json({ processedPins: i, data: finalData });
  } catch (error) {
    console.log(error.message);
    return res.status(StatusCodes.OK).send("Something went wrong.");
  }
};

const gotOffline = async (req, res) => {
  try {
    const { communityId } = req.query;
    await Community.updateOne(
      { _id: communityId },
      { $pull: { onlineMembers: mongoose.Types.ObjectId(req.user.id) } },
    );
    const userDetail = await User.findById(req.user.id, {
      name: 1,
      image: 1,
      pushToken: 1,
      shortCuts: 1,
    });
    const shortcuts = userDetail.shortCuts;
    const foundIndex = shortcuts.findIndex(
      (item) => item.id.toString() === communityId,
    );
    if (foundIndex !== -1) {
      shortcuts[foundIndex].metaData = shortcuts[foundIndex].metaData || {};
      shortcuts[foundIndex].metaData.posts = 0;
      userDetail.markModified("shortCuts");
      await userDetail.save();
    }
    io.emit(`communityOnlineStatusUpdated_${communityId}`, {
      status: 0,
      metaData: userDetail,
    });
    return res.status(StatusCodes.OK).send("Marked Offline!");
  } catch (error) {
    console.log(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const addToConstraintList = async (req, res) => {
  try {
    const { communityId, field } = req.body;
    if (field === "muted") {
      await Community.findByIdAndUpdate(communityId, {
        $addToSet: { muted: req.user.id },
      });
    } else if (field === "seeLessFeed") {
      await Community.findByIdAndUpdate(communityId, {
        $addToSet: { seeLessFeed: req.user.id },
      });
    }
    return res
      .status(StatusCodes.OK)
      .send(`Added successfully to ${field} list.`);
  } catch (error) {
    console.error(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const removeFromConstraintList = async (req, res) => {
  try {
    const { communityId, field } = req.body;
    if (field === "muted") {
      await Community.updateOne(
        { _id: communityId },
        { $pull: { muted: req.user.id } },
      );
    } else if (field === "seeLessFeed") {
      await Community.updateOne(
        { _id: communityId },
        { $pull: { seeLessFeed: req.user.id } },
      );
    }
    return res
      .status(StatusCodes.OK)
      .send(`Removed successfully from ${field} list.`);
  } catch (error) {
    console.error(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const getConstraintStatus = async (req, res) => {
  try {
    const { communityId } = req.query;
    const userId = req.user.id;
    const result = await Community.aggregate([
      { $match: { _id: mongoose.Types.ObjectId(communityId) } },
      {
        $project: {
          isMuted: { $in: [userId, { $ifNull: ["$muted", []] }] },
          isSeeingLessFeed: {
            $in: [userId, { $ifNull: ["$seeLessFeed", []] }],
          },
        },
      },
    ]);
    if (result.length === 0) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }
    const { isMuted, isSeeingLessFeed } = result[0];
    return res.status(StatusCodes.OK).json({ isMuted, isSeeingLessFeed });
  } catch (error) {
    console.error(error.message);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const updateBooleanField = async (req, res) => {
  const { communityId, fieldName, value } = req.body;
  const allowedFields = [
    "postPermission",
    "shareLinkPermission",
    "approveMembership",
  ];

  if (!allowedFields.includes(fieldName)) {
    return res.status(400).json({ error: "Invalid field name provided." });
  }
  if (typeof value !== "boolean") {
    return res
      .status(400)
      .json({ error: "The value must be a boolean (true or false)." });
  }
  try {
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: "Community not found." });
    }
    if (community.creatorId !== req.user.id) {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send("You are not authorized to change community permissions.");
    }
    community[fieldName] = value;
    await community.save();
    res.status(200).json({
      message: `Field '${fieldName}' updated successfully.`,
      updatedField: { [fieldName]: community[fieldName] },
    });
  } catch (error) {
    console.error("Error updating field:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

const addAdmin = async (req, res) => {
  const { communityId, userId } = req.body;
  if (!communityId || !userId) {
    return res
      .status(400)
      .json({ error: "Community ID and User ID are required." });
  }
  try {
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: "Community not found." });
    }
    if (community.creatorId !== req.user.id) {
      return res
        .status(StatusCodes.MISDIRECTED_REQUEST)
        .send("You are not authorized to add admins to this community.");
    }
    if (typeof userId === "string") {
      const userObjectId = mongoose.Types.ObjectId(userId);
      if (community.admins.some((adminId) => adminId.equals(userObjectId))) {
        return res.status(400).json({ error: "User is already an admin." });
      }
      community.admins.push(userObjectId);
    } else if (Array.isArray(userId)) {
      const userObjectId = userId.map((id) => mongoose.Types.ObjectId(id));
      community.admins = userObjectId;
    }
    await community.save();
    res.status(200).json({
      message: "User added to admins successfully.",
      updatedAdmins: community.admins,
    });
  } catch (error) {
    console.error("Error adding admin:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

const removeAdmin = async (req, res) => {
  const { communityId, userId } = req.body;
  if (!communityId || !userId) {
    return res
      .status(400)
      .json({ error: "Community ID and User ID are required." });
  }
  try {
    const community = await Community.findById(communityId);
    if (!community) {
      return res.status(404).json({ error: "Community not found." });
    }
    const userObjectId = mongoose.Types.ObjectId(userId);
    if (!community.admins.some((adminId) => adminId.equals(userObjectId))) {
      return res.status(400).json({ error: "User is not an admin." });
    }
    if (community.creatorId === userId) {
      return res
        .status(400)
        .json({ error: "You are creator. Cannot remove you." });
    }
    community.admins = community.admins.filter(
      (adminId) => !adminId.equals(userObjectId),
    );
    await community.save();
    res.status(200).json({
      message: "User removed from admins successfully.",
      updatedAdmins: community.admins,
    });
  } catch (error) {
    console.error("Error removing admin:", error);
    res.status(500).json({ error: "Internal server error." });
  }
};

const searchCommunityMembers = async (req, res) => {
  try {
    const { communityId, query } = req.query;
    if (!communityId || !query) {
      return res
        .status(400)
        .json({ error: "Community ID and query are required" });
    }

    const community = await Community.findById(communityId, {
      members: 1,
      admins: 1,
    });
    if (!community) {
      return res.status(404).json({ error: "Community not found" });
    }

    // Search for users whose names match the regex
    const regex = new RegExp(query, "i"); // Case-insensitive search
    const members = await User.find(
      {
        _id: { $in: community.members },
        name: regex,
      },
      { name: 1, image: 1, pushToken: 1 },
    );

    const membersWithRole = members.map((member) => ({
      ...member.toObject(),
      role: community.admins.includes(member._id) ? "Admin" : "Member",
    }));

    return res.status(200).json(membersWithRole);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const searchCommunityContent = async (req, res) => {
  try {
    const { communityId, query } = req.query;
    if (!communityId || !query) {
      return res
        .status(400)
        .json({ error: "Community ID and query are required" });
    }

    const community = await Community.findById(communityId, { content: 1 });
    if (!community) {
      return res.status(404).json({ error: "Community not found" });
    }

    const slicedContents = community.content.slice(-100);
    const contentIds = slicedContents.map((p) => p.contentId);

    // Find content where `text` or `tags` match the query
    const contentResults = await searchContentsFromIds({
      contentIds,
      search: query,
    });

    const processedResults = contentResults.map((content) => ({
      ...content,
      commentsNum:
        content.commentsNum !== undefined
          ? content.commentsNum
          : content.comments.length, // Total comments count
      comments: content.comments.slice(0, 6), // Slice top 6 comments
    }));

    return res.status(200).json(processedResults);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const searchCommunityFiles = async (req, res) => {
  try {
    const { communityId, query } = req.query;
    if (!communityId || !query) {
      return res
        .status(400)
        .json({ error: "Community ID and query are required" });
    }

    const community = await Community.findById(communityId, { content: 1 });
    if (!community) {
      return res.status(404).json({ error: "Community not found" });
    }

    const slicedContents = community.content.slice(-100);
    const contentIds = slicedContents.map(
      (p) => new mongoose.Types.ObjectId(p.contentId),
    );

    // Find content where `text` or `tags` match the query
    const contentResults = await searchContentsFromIds({
      contentIds,
      contentType: "doc",
      search: query,
    });

    const processedResults = contentResults.map((content) => ({
      ...content,
      commentsNum:
        content.commentsNum !== undefined
          ? content.commentsNum
          : content.comments.length, // Total comments count
      comments: content.comments.slice(0, 6), // Slice top 6 comments
    }));

    return res.status(200).json(processedResults);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Something went wrong" });
  }
};

const leaveAsAdmin = async (req, res) => {
  try {
    const { communityId } = req.body;
    const userId = req.user.id;

    const community = await Community.findById(communityId);
    if (!community) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Community not found" });
    }

    if (community.creatorId.toString() === userId) {
      return res.status(StatusCodes.OK).json({
        success: false,
        message: "Community creator cannot leave Admin position.",
      });
    }

    community.admins = community.admins.filter(
      (adminId) => adminId.toString() !== userId,
    );

    await community.save();

    return res
      .status(StatusCodes.OK)
      .json({ success: true, message: "You have left the admin role." });
  } catch (error) {
    console.error("Error leaving as admin:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Internal server error" });
  }
};

const setEntryRules = async (req, res) => {
  try {
    const { id } = req.query; // Get community ID from query
    const { entryRules } = req.body; // Get entry rules from request body

    // Check for entry rules
    if (!entryRules) {
      return res.status(400).json({
        success: false,
        message: "Entry rules are undefined.",
      });
    }

    //Check for the founder role
    const { creatorId } = await Community.findById(id, { creatorId: 1 });
    if (creatorId.toString() !== req.user.id) {
      return res.status(400).json({
        success: false,
        message: "You are not allowed to set entry rules.",
      });
    }

    // Validate passoutYear
    if (
      entryRules.passoutYear &&
      (entryRules.passoutYear < 1900 ||
        entryRules.passoutYear > new Date().getFullYear() + 6)
    ) {
      return res.status(400).json({
        success: false,
        message: `Passout year must be between 1900 and ${
          new Date().getFullYear() + 6
        }.`,
      });
    }

    // Allowed qualification levels
    if (entryRules.level && !levelEnum.includes(entryRules.level)) {
      return res.status(400).json({
        success: false,
        message: "Invalid qualification level provided.",
      });
    }

    // Allowed fields of study
    if (entryRules.field && !fieldsEnum.includes(entryRules.field)) {
      return res.status(400).json({
        success: false,
        message: "Invalid field of study provided.",
      });
    }

    // Find and update the community
    const updatedCommunity = await Community.findByIdAndUpdate(
      id,
      { entryRules },
      { new: true },
    );

    if (!updatedCommunity) {
      return res.status(404).json({
        success: false,
        message: "Community not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Entry rules updated successfully.",
      data: updatedCommunity.entryRules,
    });
  } catch (error) {
    console.error("Error updating entry rules:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

const getEntryRules = async (req, res) => {
  try {
    const { id } = req.query; // Get community ID from query

    // Fetch community entry rules
    const community = await Community.findById(id, { entryRules: 1 }).lean();

    if (!community) {
      return res.status(404).json({
        success: false,
        message: "Community not found.",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Entry rules fetched successfully.",
      data: community.entryRules,
    });
  } catch (error) {
    console.error("Error fetching entry rules:", error);
    res.status(500).json({
      success: false,
      message: "Internal server error.",
    });
  }
};

const removeMember = async (req, res) => {
  try {
    const { communityId, memberId } = req.body;
    const adminId = mongoose.Types.ObjectId(req.user.id);

    // Check if the requester is an admin of the community
    const community = await Community.findById(communityId, {
      admins: 1,
      title: 1,
      secondaryCover: 1,
    }).lean();
    if (!community) {
      return res.status(StatusCodes.NOT_FOUND).send("Community not found.");
    }

    if (!community.admins.some((id) => id.equals(adminId))) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("You are not authorized to remove members.");
    }

    const userObjectId = mongoose.Types.ObjectId(memberId);

    if (community.admins.some((id) => id.equals(userObjectId))) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .send("First revoke the admin rights.");
    }

    // Perform atomic updates to remove the member
    await Community.findByIdAndUpdate(communityId, {
      $pull: { members: userObjectId },
      $inc: { activeMembers: -1 },
    });

    await User.findByIdAndUpdate(userObjectId, {
      $pull: { communitiesPartOf: { communityId } },
      $push: {
        unreadNotice: {
          $each: [
            {
              key: "community",
              value: `You have been removed from the ${community.title} community.`,
              data: communityId,
              action: "community",
              params: {
                name: community.title,
                secondary: community.secondaryCover,
                id: communityId,
              },
              img2: community.secondaryCover,
            },
          ],
          $position: 0,
        },
      },
    });

    return res.status(StatusCodes.OK).send("Member removed successfully.");
  } catch (error) {
    console.error("Error removing member:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong.");
  }
};

const banUserFromCommunity = async (req, res) => {
  try {
    const { communityId, userId } = req.body;
    const creatorId = mongoose.Types.ObjectId(req.user.id);

    // Find the community
    const community = await Community.findById(communityId, {
      creatorId: 1,
      title: 1,
      secondaryCover: 1,
    }).lean();
    if (!community) {
      console.log("not comm", communityId);
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ message: "Community not found" });
    }

    // Check if the requester is the creator
    if (
      !community.creatorId === creatorId.toString() ||
      community.creatorId === userId
    ) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ message: "You are not authorized to ban users" });
    }

    const userObjectId = mongoose.Types.ObjectId(userId);

    // Remove user from members and pending requests if they exist
    await Community.findByIdAndUpdate(communityId, {
      $pull: {
        members: userObjectId,
        pendingRequests: userObjectId,
        admins: userObjectId, // Also remove them from admin if they were one
      },
      $addToSet: { banList: userObjectId }, // Prevent duplicate entries
      $inc: { activeMembers: -1 }, // Decrease activeMembers count
    });

    // Update user's communitiesPartOf (remove the community from their list)
    await User.findByIdAndUpdate(userId, {
      $pull: { communitiesPartOf: { communityId } },
      $push: {
        unreadNotice: {
          $each: [
            {
              key: "community",
              value: `You have been banned from the ${community.title} community.`,
              data: communityId,
              action: "community",
              params: {
                name: community.title,
                secondary: community.secondaryCover,
                id: communityId,
              },
              img2: community.secondaryCover,
            },
          ],
          $position: 0,
        },
      },
    });

    return res
      .status(StatusCodes.OK)
      .json({ message: "User has been banned from the community" });
  } catch (error) {
    console.error("Error banning user:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong" });
  }
};

const getBannedUsers = async (req, res) => {
  try {
    const { communityId } = req.query;

    const community = await Community.findById(communityId).populate({
      path: "banList",
      select: "name _id image pushToken",
    });

    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    return res.status(200).json({ bannedUsers: community.banList });
  } catch (error) {
    console.error("Error fetching banned users:", error);
    return res
      .status(500)
      .json({ message: "Something went wrong while fetching banned users" });
  }
};

const removeFromBanList = async (req, res) => {
  try {
    const { communityId, userId } = req.body;

    // Check if the community exists
    const community = await Community.findById(communityId, {
      creatorId: 1,
    }).lean();
    if (!community) {
      return res.status(404).json({ message: "Community not found" });
    }

    // Ensure the requester is an admin of the community
    if (community.creatorId !== req.user.id) {
      return res
        .status(403)
        .json({ message: "You are not authorized to perform this action" });
    }

    // Remove the user from the ban list
    await Community.findByIdAndUpdate(communityId, {
      $pull: { banList: userId },
    });

    return res
      .status(200)
      .json({ message: "User has been removed from the banned list" });
  } catch (error) {
    console.error("Error removing user from banned list:", error);
    return res.status(500).json({ message: "Something went wrong" });
  }
};

const checkCommunityExists = async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({ error: "Community name is required." });
    }

    // Case-insensitive search for club name
    const existingCommunity = await Community.findOne({
      title: { $regex: `^${name}$`, $options: "i" },
    });

    if (existingCommunity) {
      return res.json({
        exists: true,
        message: "Community with this name already exists.",
      });
    }

    return res.json({ exists: false, message: "Community name is available." });
  } catch (error) {
    console.error("Error checking community existence:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

const createPoll = async (req, res) => {
  try {
    const { communityId, title, options } = req.body;
    const timestamp = Date.now();
    const pollId = `${communityId}:${timestamp}`;
    const expiryTime = timestamp + 86400000;

    const userId = req.user.id;
    const userData = await User.findById(userId, {
      name: 1,
      image: 1,
      pushToken: 1,
    }).lean();

    const poll = {
      pollId,
      title,
      options,
      votes: {},
      createdAt: timestamp,
      userMetadata: {
        ...userData,
      },
    };

    await redis.set(pollId, JSON.stringify(poll), "EX", 86400);

    await redis.zadd(`community:${communityId}:polls`, expiryTime, pollId);

    await redis.expire(`community:${communityId}:polls`, 86400);

    io.emit(`communityContentUpdated_${communityId}`, {
      communityId,
      content: poll,
    });

    res.status(201).json({ message: "Poll created successfully", pollId });
  } catch (error) {
    console.error("Error creating poll:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const getPoll = async (req, res) => {
  try {
    const { pollId } = req.params;

    const pollData = await redis.get(pollId);
    if (!pollData) {
      return res.status(404).json({ message: "Poll not found or expired" });
    }

    res.status(200).json(JSON.parse(pollData));
  } catch (error) {
    console.error("Error fetching poll:", error);
    res.status(500).json({ message: "Internal Server Error" });
  }
};

const updateVote = async (req, res) => {
  try {
    const { pollId, option } = req.body;
    const userId = req.user.id;

    const pollData = await redis.get(pollId);
    if (!pollData) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .send("Poll not found or expired.");
    }

    let poll = JSON.parse(pollData);
    poll.votes[userId] = option;

    const ttl = await redis.ttl(pollId);

    await redis.setex(pollId, ttl, JSON.stringify(poll));

    return res.status(StatusCodes.OK).send("Vote recorded successfully.");
  } catch (err) {
    console.log("Error updating vote:", err);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong!");
  }
};

const searchCommunities = async (req, res) => {
  try {
    const { query, uid } = req.query;

    if (!query || typeof query !== "string" || !query.trim()) {
      return res.status(StatusCodes.OK).json([]);
    }

    // Universe scope filter — when uid is provided, restrict to that universe only
    const uidFilter = uid ? { uid: uid.toString() } : {};

    // 1. Extract meaningful keywords
    const keywords = query
      .trim()
      .replace(/[?!.,;:'"()]/g, "")
      .split(/\s+/)
      .filter((w) => w.length > 1 && !STOP_WORDS.has(w.toLowerCase()));

    if (keywords.length === 0) {
      // Fallback to simple title/tag match if no keywords (e.g. searching only for stop words)
      const results = await Community.find({
        ...uidFilter,
        $or: [
          { title: { $regex: query.trim(), $options: "i" } },
          { tag: { $regex: query.trim(), $options: "i" } },
        ],
      }).limit(10);
      return res.status(StatusCodes.OK).json(results);
    }

    // 2. Build scoring aggregation
    const keywordMatchFields = keywords.map((kw, i) => ({
      [`_kw${i}`]: {
        $cond: [
          {
            $regexMatch: {
              input: {
                $concat: [
                  { $ifNull: ["$title", ""] },
                  " ",
                  { $ifNull: ["$label", ""] },
                  " ",
                  {
                    $reduce: {
                      input: { $ifNull: ["$tag", []] },
                      initialValue: "",
                      in: { $concat: ["$$value", " ", "$$this"] },
                    },
                  },
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

    const scoreExpr = { $add: keywords.map((_, i) => `$_kw${i}`) };

    const community = await Community.aggregate([
      {
        $match: {
          ...uidFilter,
          $or: keywords.map((kw) => ({
            $or: [
              { title: { $regex: kw, $options: "i" } },
              { tag: { $regex: kw, $options: "i" } },
              { label: { $regex: kw, $options: "i" } },
            ],
          })),
        },
      },
      // Calculate scores
      { $addFields: Object.assign({}, ...keywordMatchFields) },
      { $addFields: { _kwScore: scoreExpr } },
      // Filter out low relevance (optional, but keeps results clean)
      { $match: { _kwScore: { $gt: 0 } } },
      // Sort by score
      { $sort: { _kwScore: -1, activeMembers: -1 } },
      { $limit: 20 },
      {
        $project: {
          secondaryCover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          _kwScore: 1,
          membersCount: { $size: { $ifNull: ["$members", []] } },
          top5Members: { $slice: [{ $ifNull: ["$members", []] }, 5] },
          founderId: { $toObjectId: "$creatorId" },
          isMember: {
            $in: [
              mongoose.Types.ObjectId(req?.user?.id),
              { $ifNull: ["$members", []] },
            ],
          },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "top5Members",
          foreignField: "_id",
          as: "top5Profiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "founderId",
          foreignField: "_id",
          as: "foundersDetails",
        },
      },
      {
        $project: {
          secondaryCover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          _kwScore: 1,
          membersCount: 1,
          isMember: 1,
          top5Profiles: {
            $map: {
              input: "$top5Profiles",
              as: "profile",
              in: {
                id: "$$profile._id",
                name: "$$profile.name",
                img: "$$profile.image",
                pushToken: "$$profile.pushToken",
              },
            },
          },
          foundersDetails: {
            $arrayElemAt: [
              {
                $map: {
                  input: "$foundersDetails",
                  as: "profile",
                  in: {
                    id: "$$profile._id",
                    name: "$$profile.name",
                    img: "$$profile.image",
                    pushToken: "$$profile.pushToken",
                    course: "$$profile.course",
                  },
                },
              },
              0,
            ],
          },
        },
      },
    ]);
    return res.status(StatusCodes.OK).json(community);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching the communities.");
  }
};

const getCommunityFieldsById = async (req, res) => {
  try {
    const { id, ids, fields } = req.body;

    // ✅ Validate id / ids
    const hasSingleId = !!id;
    const hasMultipleIds = Array.isArray(ids) && ids.length > 0;

    if (!hasSingleId && !hasMultipleIds) {
      return res.status(400).json({
        error: "Community id or ids array is required",
      });
    }

    // ✅ Validate fields (array OR object)
    const isArrayProjection = Array.isArray(fields) && fields.length > 0;

    const isObjectProjection =
      fields &&
      typeof fields === "object" &&
      !Array.isArray(fields) &&
      Object.keys(fields).length > 0;

    if (!isArrayProjection && !isObjectProjection) {
      return res.status(400).json({
        error: "fields must be a non-empty array or projection object",
      });
    }

    // ✅ Normalize projection for Mongoose
    const projection = isArrayProjection ? fields.join(" ") : fields;

    // ✅ Case 1: Multiple IDs
    if (hasMultipleIds) {
      const communities = await Community.find({
        _id: { $in: ids },
      }).select(projection);

      if (!communities || communities.length === 0) {
        return res.status(404).json({
          error: "Communities not found",
        });
      }

      return res.status(200).json({
        data: communities,
      });
    }

    // ✅ Case 2: Single ID
    const community = await Community.findById(id).select(projection);

    if (!community) {
      return res.status(404).json({
        error: "Community not found",
      });
    }

    return res.status(200).json({
      data: community,
    });
  } catch (err) {
    console.error("Error fetching community fields:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

const getRandomCommunities = async (req, res) => {
  try {
    // Parse and validate the size query param
    const size = parseInt(req.query.size, 10) || 3;
    if (size <= 0) {
      return res.status(400).json({ error: "Invalid size parameter." });
    }

    // Parse and construct the projection query param (e.g., ?projection=content,title)
    const projectionFields = req.query.projection
      ? req.query.projection.split(",").reduce((acc, field) => {
          acc[field.trim()] = 1;
          return acc;
        }, {})
      : {};

    const communities = await Community.aggregate([
      { $sample: { size } },
      ...(Object.keys(projectionFields).length
        ? [{ $project: projectionFields }]
        : []),
    ]);

    return res.status(200).json(communities);
  } catch (error) {
    console.error("Error fetching random communities:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

const fetchCommunityLeaderBoard = async (req, res) => {
  try {
    const limitParam = Number(req.query.limit);
    const limit = !isNaN(limitParam) && limitParam > 0 ? limitParam : 30;
    const communities = await Community.aggregate([
      {
        $sort: { rating: -1 },
      },
      {
        $limit: limit,
      },
      {
        $project: {
          secondaryCover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          rating: 1,
          membersCount: { $size: "$members" },
          top5Members: { $slice: ["$members", 5] },
          founderId: { $toObjectId: "$creatorId" },
          isMember: { $in: [mongoose.Types.ObjectId(req.user.id), "$members"] },
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "top5Members",
          foreignField: "_id",
          as: "top5Profiles",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "founderId",
          foreignField: "_id",
          as: "foundersDetails",
        },
      },
      {
        $project: {
          secondaryCover: 1,
          label: 1,
          activeMembers: 1,
          title: 1,
          tag: 1,
          membersCount: 1,
          rating: 1,
          isMember: 1,
          top5Profiles: {
            $map: {
              input: "$top5Profiles",
              as: "profile",
              in: {
                id: "$$profile._id",
                name: "$$profile.name",
                img: "$$profile.image",
                pushToken: "$$profile.pushToken",
              },
            },
          },
          foundersDetails: {
            $arrayElemAt: [
              {
                $map: {
                  input: "$foundersDetails",
                  as: "profile",
                  in: {
                    id: "$$profile._id",
                    name: "$$profile.name",
                    img: "$$profile.image",
                    pushToken: "$$profile.pushToken",
                    course: "$$profile.course",
                  },
                },
              },
              0,
            ],
          },
        },
      },
    ]);

    if (communities.length >= 2) {
      [communities[0], communities[1]] = [communities[1], communities[0]];
    }

    return res.status(StatusCodes.OK).json(communities);
  } catch (error) {
    console.error(error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("An error occurred while fetching the community leaderboard.");
  }
};

const getAllCommunity = async (req, res) => {
  try {
    const { fields } = req.body;

    let projection;

    // ✅ If fields is provided, validate it
    if (fields !== undefined) {
      const isArrayProjection = Array.isArray(fields) && fields.length > 0;

      const isObjectProjection =
        fields &&
        typeof fields === "object" &&
        !Array.isArray(fields) &&
        Object.keys(fields).length > 0;

      if (!isArrayProjection && !isObjectProjection) {
        return res.status(400).json({
          error: "fields must be a non-empty array or projection object",
        });
      }

      projection = isArrayProjection ? fields.join(" ") : fields;
    }

    // ✅ Fetch communities
    const communities = projection
      ? await Community.find().select(projection)
      : await Community.find();

    return res.status(200).json({
      message: "Communities fetched successfully",
      data: communities,
    });
  } catch (error) {
    console.error("Error fetching communities:", error);
    return res.status(500).json({
      error: "Server error while fetching communities",
    });
  }
};

// Controller to populate all the communities with universeMetaData
const DEFAULT_UNIVERSE = {
  uid: "696f491a0bfc89b35dc62326",
  name: "Lovely Professional University",
  callSign: "LPU",
  location: "Punjab, India",
  logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
  logoKey: "public/universes/lpu_logo-removebg-preview.png",
  lat: 31.255,
  lng: 75.705,
};

const populateUniverseMetaDataInCommunities = async (req, res) => {
  try {
    const result = await Community.updateMany(
      {
        universeMetaData: { $exists: false },
      },
      {
        $set: {
          universeMetaData: DEFAULT_UNIVERSE,
          uid: DEFAULT_UNIVERSE.uid,
        },
      },
      { strict: false },
    );

    return res.json({
      success: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  } catch (err) {
    console.error("Community migration failed:", err);
    return res.status(500).json({
      success: false,
      error: err.message,
    });
  }
};

const getCommunitiesRecommendation = async (req, res) => {
  try {
    const { nIds } = req.body || {}; // <- fallback if req.body is undefined

    const excludedIds = Array.isArray(nIds)
      ? nIds
          .filter((id) => mongoose.Types.ObjectId.isValid(id))
          .map((id) => new mongoose.Types.ObjectId(id))
      : [];

    const pipeline = [];

    if (excludedIds.length > 0) {
      pipeline.push({
        $match: {
          _id: { $nin: excludedIds },
        },
      });
    }

    pipeline.push(
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
    );

    const communities = await Community.aggregate(pipeline);

    return res.status(200).json(communities);
  } catch (error) {
    console.error("Error fetching communities recommendations:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

const fetchMultipleCommunitiesFromIds = async (req, res) => {
  try {
    const { ids, fields } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: "An array of ids is required." });
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: "An array of fields is required." });
    }

    const validIds = ids.filter((id) => mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      return res.status(400).json({ error: "No valid ObjectIds provided." });
    }

    const projection = fields.join(" ");
    const communities = await Community.find({ _id: { $in: validIds } }).select(
      projection,
    );

    return res.status(200).json({ data: communities });
  } catch (error) {
    console.error("Error fetching communities:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

const searchCommunitiesWithRegex = async (req, res) => {
  try {
    const { regexPatterns } = req.body;

    const regexes = regexPatterns.map((str) => new RegExp(str, "i"));

    const query = {
      $or: [
        ...regexes.map((r) => ({ title: { $regex: r } })),
        ...regexes.map((r) => ({ label: { $regex: r } })),
        ...regexes.map((r) => ({ tag: { $regex: r } })),
      ],
    };

    const communities = await Community.find(query, {
      secondaryCover: 1,
      title: 1,
      tag: 1,
      label: 1,
      _id: 1,
    });

    return res.status(200).json({ data: communities });
  } catch (error) {
    console.error("Error searching clubs:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

const getCommunitiesForFeed = async (req, res) => {
  try {
    const userId = req.user.id;
    const { uid, universeId } = req.query;
    const limit = 4;
    const resolvedUniverseId = universeId || uid || "multiverse";
    const universeFilter =
      resolvedUniverseId !== "multiverse" ? { uid: resolvedUniverseId } : {};

    const user = await User.findById(userId, {
      interests: 1,
      communitiesPartOf: 1,
    });

    if (!user) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "User not found." });
    }

    const interestTags = user.interests || [];
    const joinedCommunityIds = (user.communitiesPartOf || []).map(
      (c) => c.communityId,
    );

    // Query for suggested communities: matches interests (tag/label/title), not already matched
    // We use $or for flexibility
    const suggestedCommunities =
      interestTags.length > 0
        ? await Community.aggregate([
            {
              $match: {
                _id: { $nin: joinedCommunityIds },
                $or: [
                  { tag: { $in: interestTags } },
                  { label: { $in: interestTags } },
                  // Optional: { title: { $in: interestTags } } if titles match interests
                ],
                ...universeFilter,
              },
            },
            { $sample: { size: limit } },
            {
              $project: {
                secondaryCover: 1,
                title: 1,
                tag: 1,
                activeMembers: 1,
                label: 1,
                uid: 1,
                universeMetaData: 1,
              },
            },
          ])
        : [];

    let finalCommunities = [...suggestedCommunities];

    // Fallback
    if (finalCommunities.length < limit) {
      const needed = limit - finalCommunities.length;
      const currentIds = finalCommunities.map((c) => c._id);
      const excludeIds = [...joinedCommunityIds, ...currentIds];

      const fallbackCommunities = await Community.aggregate([
        {
          $match: {
            _id: { $nin: excludeIds },
            ...universeFilter,
          },
        },
        { $sample: { size: needed } },
        {
          $project: {
            secondaryCover: 1,
            title: 1,
            tag: 1,
            activeMembers: 1,
            label: 1,
            uid: 1,
            universeMetaData: 1,
          },
        },
      ]);

      finalCommunities = [...finalCommunities, ...fallbackCommunities];
    }

    return res.status(StatusCodes.OK).json({ communities: finalCommunities });
  } catch (error) {
    console.error("Error in getCommunitiesForFeed:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .send("Something went wrong");
  }
};

const getCommunityGrowthStats = async (req, res) => {
  try {
    const periodParam = req.query.period || "30d";
    const limit = parseInt(req.query.limit) || 10;

    // Parse period string to days
    const periodMap = { "7d": 7, "30d": 30, "90d": 90 };
    const days = periodMap[periodParam] || 30;

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const pastDate = new Date(now);
    pastDate.setDate(pastDate.getDate() - days);

    // Fetch all communities with metadata
    const communities = await Community.find(
      {},
      {
        title: 1,
        members: 1,
        activeMembers: 1,
        "universeMetaData.logoKey": 1,
        "universeMetaData.name": 1,
      },
    ).lean();

    if (!communities || communities.length === 0) {
      return res.status(StatusCodes.OK).json({
        membershipData: [],
        topGrowth: [],
      });
    }

    const communityIds = communities.map((c) => c._id);

    // Fetch the most recent snapshot and the snapshot closest to pastDate for each community
    const [latestSnapshots, pastSnapshots] = await Promise.all([
      CommunitySnapshot.aggregate([
        { $match: { communityId: { $in: communityIds } } },
        { $sort: { snapshotDate: -1 } },
        {
          $group: {
            _id: "$communityId",
            memberCount: { $first: "$memberCount" },
            snapshotDate: { $first: "$snapshotDate" },
          },
        },
      ]),
      CommunitySnapshot.aggregate([
        {
          $match: {
            communityId: { $in: communityIds },
            snapshotDate: { $lte: pastDate },
          },
        },
        { $sort: { snapshotDate: -1 } },
        {
          $group: {
            _id: "$communityId",
            memberCount: { $first: "$memberCount" },
            snapshotDate: { $first: "$snapshotDate" },
          },
        },
      ]),
    ]);

    // Build lookup maps
    const latestMap = {};
    latestSnapshots.forEach((s) => {
      latestMap[s._id.toString()] = s.memberCount;
    });

    const pastMap = {};
    pastSnapshots.forEach((s) => {
      pastMap[s._id.toString()] = s.memberCount;
    });

    // Build community data with counts and growth
    const communityData = communities.map((c) => {
      const id = c._id.toString();
      // Prefer snapshot count, fallback to live members array length
      const currentCount =
        latestMap[id] !== undefined
          ? latestMap[id]
          : c.members
            ? c.members.length
            : 0;
      const pastCount = pastMap[id];

      let growthPct = 0;
      if (pastCount !== undefined && pastCount > 0) {
        growthPct = ((currentCount - pastCount) / pastCount) * 100;
      } else if (pastCount === 0 && currentCount > 0) {
        growthPct = 100; // from 0 to something is 100% growth
      }

      return {
        _id: c._id,
        name: c.title,
        count: currentCount,
        growth: growthPct,
        logoKey: c.universeMetaData?.logoKey || null,
        universeName: c.universeMetaData?.name || null,
      };
    });

    // Sort by member count descending for membershipData
    const sortedByCount = [...communityData].sort((a, b) => b.count - a.count);

    const maxCount = sortedByCount.length > 0 ? sortedByCount[0].count : 1;

    const membershipData = sortedByCount.slice(0, limit).map((c) => ({
      _id: c._id,
      name: c.name,
      count: c.count,
      pct: maxCount > 0 ? parseFloat((c.count / maxCount).toFixed(2)) : 0,
      logoKey: c.logoKey,
    }));

    // Sort by growth descending for topGrowth
    const sortedByGrowth = [...communityData].sort(
      (a, b) => b.growth - a.growth,
    );

    const topGrowth = sortedByGrowth
      .slice(0, limit)
      .filter((c) => c.growth !== 0)
      .map((c) => ({
        _id: c._id,
        name: c.name,
        growth: `${c.growth >= 0 ? "+" : ""}${c.growth.toFixed(0)}%`,
        logoKey: c.logoKey,
      }));

    return res.status(StatusCodes.OK).json({
      membershipData,
      topGrowth,
      period: periodParam,
    });
  } catch (error) {
    console.error("Error fetching community growth stats:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong while fetching growth stats." });
  }
};

const getMembersPerUniverse = async (req, res) => {
  try {
    const communityId = req.query.id;
    if (!communityId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ message: "Community ID is required" });
    }

    const community = await Community.findById(communityId, {
      members: 1,
    }).lean();
    if (!community || !community.members || community.members.length === 0) {
      return res.status(StatusCodes.OK).json({ universeMembership: [] });
    }

    // Fetch all members with their universeMetaData
    const members = await User.find(
      { _id: { $in: community.members } },
      {
        "universeMetaData.name": 1,
        "universeMetaData.logoKey": 1,
        "universeMetaData.callSign": 1,
      },
    ).lean();

    // Group by universe name
    const universeMap = {};
    members.forEach((m) => {
      const uniName =
        m.universeMetaData?.name || m.universeMetaData?.callSign || "Unknown";
      const logoKey = m.universeMetaData?.logoKey || null;
      if (!universeMap[uniName]) {
        universeMap[uniName] = { name: uniName, count: 0, logoKey };
      }
      universeMap[uniName].count += 1;
    });

    const universeData = Object.values(universeMap).sort(
      (a, b) => b.count - a.count,
    );
    const maxCount = universeData.length > 0 ? universeData[0].count : 1;

    const universeMembership = universeData.map((u) => ({
      name: u.name,
      count: u.count,
      pct: maxCount > 0 ? parseFloat((u.count / maxCount).toFixed(2)) : 0,
      logoKey: u.logoKey,
    }));

    return res.status(StatusCodes.OK).json({ universeMembership });
  } catch (error) {
    console.error("Error fetching members per universe:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ message: "Something went wrong." });
  }
};

module.exports = {
  createCommunity,
  deleteCommunity,
  joinAsMember,
  leaveAsMember,
  deleteContent,
  flag,
  takeDown,
  updateStreak,
  likesAndPosts,
  rating,
  getAllCommunities,
  getCommunityById,
  getCommunityByTag,
  isMember,
  getContentOfACommunity,
  getCommunitiesPartOf,
  getLatestContent,
  getCommunityProfile,
  getUserProfile,
  getLikeAndFlagStatus,
  getBasicCommunityDataFromId,
  getUserContributionCover,
  getContribution,
  getAllTags,
  getLikedPosts,
  getFastFeed,
  getFastNativeFeed,
  post,
  editCommunityProfile,
  getAllContributionOfUser,
  getAllMembers,
  getAllAdmins,
  getAllRelatedSocialGroups,
  getBatchedContent,
  getOthersContributionCover,
  getMediaAndDocs,
  gotOffline,
  addToConstraintList,
  removeFromConstraintList,
  getConstraintStatus,
  updateBooleanField,
  addAdmin,
  removeAdmin,
  searchCommunityMembers,
  searchCommunityContent,
  searchCommunityFiles,
  leaveAsAdmin,
  setEntryRules,
  getEntryRules,
  removeMember,
  banUserFromCommunity,
  getBannedUsers,
  removeFromBanList,
  checkCommunityExists,
  createPoll,
  getPoll,
  updateVote,
  searchCommunities,
  getCommunityFieldsById,
  getRandomCommunities,
  fetchCommunityLeaderBoard,
  getAllCommunity,
  populateUniverseMetaDataInCommunities,
  getCommunitiesRecommendation,
  fetchMultipleCommunitiesFromIds,
  searchCommunitiesWithRegex,
  getCommunitiesForFeed,
  getCommunityGrowthStats,
  getMembersPerUniverse,
};
