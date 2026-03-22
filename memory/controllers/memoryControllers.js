const { StatusCodes } = require("http-status-codes");
const Memory = require("../models/memory");
const { default: mongoose, STATES } = require("mongoose");
const { generateUri, scheduleNotification2 } = require("./utils");
const {
  fetchCalendarData,
  fetchTemplateCover,
  getMonthlyMediaPaginated,
  getLatestTwoImages,
} = require("./memoryControllersUtility/utility");
const { fetchNativeUserData, fetchClubData, getUserMetaMap } = require("./interServiceCall");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");

/**
 * @desc Create a new memory in the user's Memory Lane
 * @route POST /api/memory
 * @access Private
 */

// helper function to handle tags
async function handleTags({ tags, memoryId, userId, callSign }) {
  try {
    const validTags = tags.filter((t) => ["club", "people"].includes(t.type));
    let validPeopleTags = [];

    await Promise.all(
      validTags.map(async (tag) => {
        try {
          if (tag.type === "people") {
            validPeopleTags.push(tag._id);
            await sendKafkaMessage("UPDATE_USER_MEMORY_LIST", tag.callSign, {
              id: tag._id,
              memoryId,
              operation: "add"
            })
          } else if (tag.type === "club") {
            await sendKafkaMessage("UPDATE_CLUB_MEMORY_LIST", tag.callSign, {
              id: tag._id,
              memoryId,
              operation: "add"
            })
          }
        } catch (innerErr) {
          console.warn(
            `Failed to update memoryRequests for tag ${tag._id}:`,
            innerErr.message
          );
        }
      })
    );

    //  Add all valid people to the creator's memoryList (no duplicates)
    if (validPeopleTags.length > 0) {
      await sendKafkaMessage("UPDATE_MEMORY_LIST", callSign, {
        id: userId,
        validPeopleTags
      })
    }
  } catch (error) {
    console.log("Error handling tags", error);
  }
}

// function to execute all secondary actions after memory creation
async function memoryCreationSecondaryActions({
  tags = [],
  createdBy,
  creatorMetaData,
  title,
  caption,
  assets = [],
  memoryId,
}) {
  try {
    // Separate people and club tags
    const { people: validPeopleTags, club: validClubTags } = tags.reduce(
      (acc, t) => {
        if (t.type === "people") acc.people.push(t._id);
        else if (t.type === "club") acc.club.push(t._id);
        return acc;
      },
      { people: [], club: [] }
    );

    // Find users for notifications
    const users = await getUserMetaMap(validPeopleTags, [
      "unreadNotice",
      "pushToken",
    ]);

    const tokens = users.map((u) => u.pushToken).filter(Boolean);

    // Helpers
    function getPreview(text, maxWords = 20) {
      if (!text) return "";
      const words = text.split(/\s+/);
      return words.slice(0, maxWords).join(" ").trim();
    }

    function getRightCaption() {
      if (title) return getPreview(title);
      if (caption) return getPreview(caption);
      return "Tap to save it in your memory lane.";
    }

    async function getRightMedia() {
      const imageAsset = assets.find((a) => a.type === "image" && a.url);
      if (imageAsset) return await generateUri(imageAsset.url);
      return "";
    }

    const image = await getRightMedia();

    // Send push notifications
    scheduleNotification2({
      pushToken: tokens,
      title: `${creatorMetaData.name} shared a memory with you!`,
      body: getRightCaption(),
      image,
      url: `https://macbease.com/app/profile/${createdBy}`,
    });

    // Create in-app notice object
    const notice = {
      value: `${creatorMetaData.name} shared a memory with you!`,
      img1: `${creatorMetaData.image}`,
      img2: `${assets.length > 0 ? assets[0].url : ""}`,
      action: "profile2",
      key: "memory",
      params: {
        img: creatorMetaData.image,
        name: creatorMetaData.name,
        id: createdBy,
      },
      uid: `memory_${memoryId}`,
      createdAt: new Date(),
    };

    // Push the notice into each tagged user's unreadNotice array
    await sendKafkaMessage("UPDATE_USER_MEMORY_NOTICE", creatorMetaData.callSign, {
      notice,
      validPeopleTags
    })
  } catch (error) {
    console.error("Error in memoryCreationSecondaryActions:", error);
  }
}

const createMemory = async (req, res) => {
  try {
    const userId = req.user.id;

    const {
      type,
      template,
      title,
      caption,
      tags = [],
      assets = [],
      animation,
      certificate,
      uploadEnabled = false,
      date,
      visibility = "private",
      universeMetaData
    } = req.body;

    //  Basic Validation
    if (!type) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Memory type is required." });
    }

    //  Get user info
    const creatorInfo = await fetchNativeUserData({
      id: userId,
      fields: ["name", "image"],
      callSign: "universe"
    })

    let carouselType = "";

    if (assets.length >= 8 && assets.every((a) => a.type === "image")) {
      carouselType = "polaroids";
    } else if (
      assets.length >= 3 &&
      assets.slice(0, 3).every((a) => a.type === "image")
    ) {
      const rand = Math.random();
      if (rand < 0.5) {
        carouselType = ""; // 50% chance — no carousel
      } else if (rand < 0.75) {
        carouselType = "collage"; // next 25%
      } else {
        carouselType = "mindspace"; // last 25%
      }
    }

    //  Construct the memory payload
    const memoryData = {
      createdBy: userId,
      type,
      template,
      title,
      caption,
      tags,
      assets,
      animation,
      certificate,
      uploadEnabled,
      date: date ? new Date(date) : new Date(),
      visibility,
      carouselType,
      creatorMetaData: {
        name: creatorInfo.name,
        image: creatorInfo.image,
      },
      universeMetaData,
      uid: req.user.uid
    };

    //  Create memory
    const memory = await Memory.create(memoryData);

    // Add memory to tagged
    if (visibility !== "private") {
      await handleTags({ tags, memoryId: memory._id, userId, callSign: "universe" });
    }

    // Handle secondary actions
    if (visibility !== "private" && tags.length > 0) {
      memoryCreationSecondaryActions({
        title,
        caption,
        assets,
        tags,
        creatorMetaData: memoryData.creatorMetaData,
        createdBy: memoryData.createdBy,
        memoryId: memory._id,
      });
    }

    // Publish user.activity event for SERE onboarding tracking
    try {
      await sendKafkaMessage("USER_ACTIVITY", "user", {
        userId,
        uid: req.user.uid,
        activityType: "memory_upload",
        ref: memory._id.toString(),
      });
    } catch (kafkaErr) {
      console.error("user.activity publish failed:", kafkaErr.message);
    }

    return res.status(StatusCodes.CREATED).json({
      msg: "Memory added to your Memory Lane 🪐",
      memory,
    });
  } catch (error) {
    console.error("Error creating memory:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Something went wrong while saving your memory.",
    });
  }
};

/**
 * @desc Get user's memories in batches (paginated)
 * @route GET /api/memory
 * @access Private
 */
const getMemories = async (req, res) => {
  try {
    const userId = req.user.id;

    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 6;
    const skip = (page - 1) * limit;

    // Filters
    const {
      type,
      visibility,
      search,
      createdBy, // optional admin use
    } = req.query;

    // 🧠 Base query
    let query = {};

    if (createdBy) {
      // Admin viewing specific user's memories
      query.createdBy = createdBy;
    } else {
      // Regular user: fetch memories created by OR saved by them
      query.$or = [{ createdBy: userId }, { savedBy: userId }];
    }

    // Type, visibility filters
    if (type) query.type = type;
    if (visibility) query.visibility = visibility;

    // Text search (title, caption, tags)
    if (search) {
      const regex = new RegExp(search, "i");
      query.$and = query.$and || [];
      query.$and.push({
        $or: [{ title: regex }, { caption: regex }, { tags: { $in: [regex] } }],
      });
    }

    // Excluding pinned memories
    const user = await fetchNativeUserData({
      id: userId,
      fields: ["memoryRequests", "pinnedMemories"],
      callSign: "universe"
    });
    query._id = { $nin: user.pinnedMemories || [] };

    // Fetch memories
    const memories = await Memory.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Total count for frontend
    const total = await Memory.countDocuments(query);

    // Load memory requests and pinned memories only for first batch
    let memoryRequests = [];
    let pinnedMemories = [];

    if (page === 1) {
      if (user?.pinnedMemories?.length) {
        pinnedMemories = await Memory.find({
          _id: { $in: user.pinnedMemories },
        })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();
        pinnedMemories = pinnedMemories.map((item) => ({
          ...item,
          isPinned: true,
        }));
      }

      if (user?.memoryRequests?.length) {
        memoryRequests = await Memory.find({
          _id: { $in: user.memoryRequests },
        })
          .sort({ createdAt: -1 })
          .limit(10)
          .lean();
      }
    }

    return res.status(StatusCodes.OK).json({
      msg: "Memories fetched successfully.",
      data: memories,
      memoryRequests,
      pinnedMemories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + memories.length < total,
      },
    });
  } catch (error) {
    console.error("Error fetching memories:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Something went wrong while fetching memories.",
      error: error.message,
    });
  }
};

/**
 * @desc Get user's memories in batches (paginated)
 * @route GET /api/memory
 * @access Private
 */
const getOthersMemories = async (req, res) => {
  try {
    const { userId } = req.query; // profile being viewed
    const viewerId = req.user.id; // logged-in user

    if (!userId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "userId is required." });
    }

    // Pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Fetch target user
    const targetUser = await fetchNativeUserData({
      id: userId,
      fields: ["pinnedMemories", "memoryList"],
      callSign: "universe"
    })


    if (!targetUser) {
      return res.status(StatusCodes.NOT_FOUND).json({ msg: "User not found." });
    }

    // Check if viewer is part of target's memory list
    const isInMemoryList = (targetUser?.memoryList || []).some(
      (id) => id.toString() === viewerId.toString()
    );

    //  Base query
    const query = {
      $or: [
        //  Normal public & memory list visibility
        {
          $and: [
            { $or: [{ createdBy: userId }, { savedBy: userId }] },
            {
              visibility: {
                $in: isInMemoryList ? ["public", "inMemoryList"] : ["public"],
              },
            },
          ],
        },
        //  Include "inThisMemory" if viewer is part of savedBy
        {
          $and: [
            { visibility: "inThisMemory" },
            { savedBy: viewerId },
            { $or: [{ createdBy: userId }, { savedBy: userId }] },
          ],
        },
      ],
      _id: { $nin: targetUser.pinnedMemories || [] },
    };

    // Fetch memories
    const memories = await Memory.find(query)
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    // Count for pagination
    const total = await Memory.countDocuments(query);

    // Load pinned memories (first page only)
    let pinnedMemories = [];
    if (page === 1 && targetUser?.pinnedMemories?.length) {
      pinnedMemories = await Memory.find({
        _id: { $in: targetUser.pinnedMemories },
      })
        .sort({ createdAt: -1 })
        .limit(10)
        .lean();

      pinnedMemories = pinnedMemories.map((m) => ({
        ...m,
        isPinned: true,
      }));
    }

    return res.status(StatusCodes.OK).json({
      msg: "Memories fetched successfully.",
      data: memories,
      pinnedMemories,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + memories.length < total,
      },
    });
  } catch (error) {
    console.error("❌ Error fetching memories:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Something went wrong while fetching memories.",
      error: error.message,
    });
  }
};

/**
 * @desc Edit a memory lane
 * @route PATCH /api/memory/:id
 * @access Private (only creator)
 */

// helper function to clean tags
async function cleanTags({ tags = [], memoryId, userId }) {
  try {
    const memory = await Memory.findById(memoryId);
    if (!memory) {
      console.warn(`Memory ${memoryId} not found for cleanup.`);
      return;
    }

    // ---------- REMOVE FROM savedBy ----------
    const tagIdsToRemove = tags.map((t) => t._id.toString());

    memory.savedBy = (memory.savedBy || []).filter(
      (id) => !tagIdsToRemove.includes(id.toString())
    );

    // ---------- VALID TAGS ONLY ----------
    const validTags = tags.filter((tag) =>
      ["people", "club"].includes(tag.type)
    );

    // Clean up from each tagged entity
    await Promise.all(
      validTags.map(async (tag) => {
        try {
          if (tag.type === "people") {
            await sendKafkaMessage("UPDATE_USER_MEMORY_LIST", tag.callSign, {
              id: tag._id,
              memoryId,
              operation: "remove"
            })
          } else if (tag.type === "club") {
            await sendKafkaMessage("UPDATE_CLUB_MEMORY_LIST", tag.callSign, {
              id: tag._id,
              memoryId,
              operation: "remove"
            })
          }
        } catch (innerErr) {
          console.warn(
            `Failed to clean memory ${memoryId} from ${tag.type} ${tag._id}:`,
            innerErr.message
          );
        }
      })
    );

    await memory.save();
  } catch (error) {
    console.error(" Error cleaning up tags for memory:", error);
  }
}

const editMemory = async (req, res) => {
  try {
    const { memoryId } = req.query;
    const userId = req.user.id;
    const updates = req.body;

    //  Find the memory
    const memory = await Memory.findById(memoryId);
    if (!memory) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ msg: "Memory not found." });
    }

    //  Only creator can edit
    if (memory.createdBy.toString() !== userId.toString()) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ msg: "You are not authorized to edit this memory." });
    }

    //  Check for visibility change logic
    // ---------- VISIBILITY STATE ----------
    const isPrivacyChanging =
      updates.visibility && updates.visibility !== memory.visibility;

    const wasPrivate = memory.visibility === "private";
    const isPrivateNow = updates.visibility === "private";

    // Transitions
    const isChangingToPrivate = isPrivacyChanging && isPrivateNow;

    const isChangingFromPrivateToOther =
      isPrivacyChanging && wasPrivate && !isPrivateNow;

    const isTogglingBetweenNonPrivate =
      isPrivacyChanging && !wasPrivate && !isPrivateNow;

    // ---------- TAG DIFF ----------
    const updatedTags = updates.tags || [];
    const oldTags = memory.tags || [];

    const oldTagIds = oldTags.map((t) => t._id.toString());
    const updatedTagIds = updatedTags.map((t) => t._id.toString());

    const addedTags = updatedTags.filter(
      (t) => !oldTagIds.includes(t._id.toString())
    );

    const removedTags = oldTags.filter(
      (t) => !updatedTagIds.includes(t._id.toString())
    );

    // ---------- APPLY RULES ----------
    if (!isPrivacyChanging) {
      // Visibility NOT changed
      if (!wasPrivate) {
        // non-private → non-private
        await handleTags({ tags: addedTags, memoryId, userId, callSign: "universe" });
        await cleanTags({ tags: removedTags, memoryId, userId });
      }
    } else {
      // Visibility IS changing
      if (isChangingToPrivate) {
        // any → private
        await cleanTags({ tags: oldTags, memoryId, userId });
      } else if (isChangingFromPrivateToOther) {
        // private → non-private
        await handleTags({ tags: updatedTags, memoryId, userId, callSign: "universe" });
      } else if (isTogglingBetweenNonPrivate) {
        // non-private → non-private
        await handleTags({ tags: addedTags, memoryId, userId, callSign: "universe" });
        await cleanTags({ tags: removedTags, memoryId, userId });
      }
    }

    //  Define allowed fields to be updated
    const allowedFields = [
      "title",
      "caption",
      "tags",
      "assets",
      "animation",
      "uploadEnabled",
      "date",
      "visibility",
      "template",
      "type",
    ];

    //  Apply allowed updates only
    for (const key of Object.keys(updates)) {
      if (allowedFields.includes(key)) {
        memory[key] = updates[key];
      }
    }

    //  Save changes
    await memory.save();

    return res.status(StatusCodes.OK).json({
      msg: "Memory updated successfully.",
      memory,
    });
  } catch (error) {
    console.error("Error editing memory:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Something went wrong while editing memory.",
      error: error.message,
    });
  }
};

/**
 * @desc    Remove a memory request from a user's memoryRequests list
 * @route   POST /api/memory/removeMemoryRequest/:id
 * @access  Private (only authenticated user)
 */
const removeMemoryRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { memoryId } = req.query;

    if (!memoryId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Memory ID is required." });
    }

    await sendKafkaMessage("UPDATE_USER_MEMORY_LIST", "universe", {
      id: userId,
      memoryId,
      operation: "remove"
    })

    return res.status(StatusCodes.OK).json({
      msg: "Memory request removed successfully."
    });
  } catch (error) {
    console.error("❌ Error removing memory request:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Server error.", error: error.message });
  }
};

/**
 * @desc    Save a memory request from a user's memoryRequests list
 * @route   POST /api/memory/saveMemoryRequest/:id
 * @access  Private (only authenticated user)
 */
const saveMemoryRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { memoryId } = req.query;

    if (!memoryId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Memory ID is required." });
    }

    const memory = await Memory.findById(memoryId);
    if (!memory) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ msg: "Memory not found." });
    }

    await sendKafkaMessage("UPDATE_USER_MEMORY_LIST", "universe", {
      id: userId,
      memoryId,
      operation: "remove"
    })

    const alreadySaved = memory.savedBy.includes(userId);
    if (!alreadySaved) {
      memory.savedBy.push(userId);
      await memory.save();
    }

    return res.status(StatusCodes.OK).json({
      msg: "Memory request saved successfully.",
      savedBy: memory.savedBy,
    });
  } catch (error) {
    console.error("❌ Error saving memory request:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Server error.",
      error: error.message,
    });
  }
};

/**
 * @desc    Remove a memory from a user's saved list (unsave)
 * @route   POST /api/memory/unsaveMemoryRequest/:id
 * @access  Private (only authenticated user)
 */
const unsaveMemoryRequest = async (req, res) => {
  try {
    const userId = req.user.id;
    const { memoryId } = req.query; // from route /:id

    if (!memoryId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Memory ID is required." });
    }

    //  Check if memory exists
    const memory = await Memory.findById(memoryId);
    if (!memory) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ msg: "Memory not found." });
    }

    //  Remove userId from savedBy
    const updatedMemory = await Memory.findByIdAndUpdate(
      memoryId,
      { $pull: { savedBy: userId } },
      { new: true }
    );

    return res.status(StatusCodes.OK).json({
      msg: "Memory unsaved successfully.",
      savedBy: updatedMemory.savedBy,
    });
  } catch (error) {
    console.error("❌ Error unsaving memory:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Server error.", error: error.message });
  }
};

/**
 * @desc    Delete a memory (only creator can delete)
 * @route   DELETE /api/memory/:id
 * @access  Private
 */
const deleteMemory = async (req, res) => {
  try {
    const userId = req.user.id;
    const { memoryId } = req.query;

    if (!memoryId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Memory ID is required." });
    }

    //  Find the memory
    const memory = await Memory.findById(memoryId);

    if (!memory) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ msg: "Memory not found." });
    }

    //  Check ownership
    if (memory.createdBy.toString() !== userId.toString()) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ msg: "You are not authorized to delete this memory." });
    }

    //  Delete the memory
    await memory.deleteOne();

    return res.status(StatusCodes.OK).json({
      msg: "Memory deleted successfully.",
      deletedMemoryId: memoryId,
    });
  } catch (error) {
    console.error("❌ Error deleting memory:", error);
    return res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ msg: "Server error.", error: error.message });
  }
};

/**
 * @desc    Set or toggle the isPinned field of a memory (only creator can do this)
 * @route   PATCH /api/memory/:id/pin
 * @access  Private
 */
const setMemoryPinned = async (req, res) => {
  try {
    const userId = req.user.id;
    const { memoryId } = req.query;
    const { isPinned } = req.body;

    if (!memoryId) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ msg: "Memory ID is required." });
    }

    if (isPinned) {
      await sendKafkaMessage("UPDATE_USER_PINNED_MEMORY", "universe", {
        id: userId.toString(),
        memoryId,
        operation: "add"
      })
    } else {
      await sendKafkaMessage("UPDATE_USER_PINNED_MEMORY", "universe", {
        id: userId.toString(),
        memoryId,
        operation: "remove"
      })
    }

    return res.status(StatusCodes.OK).json({
      msg: isPinned
        ? "Memory pinned successfully."
        : "Memory unpinned successfully",
      memoryId,
    });
  } catch (error) {
    console.error("❌ Error setting memory pin status:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      msg: "Server error.",
      error: error.message,
    });
  }
};

// @desc    Get memory by ID
// @route   GET /api/memories/:memoryId
// @access  Protected
const getMemoryById = async (req, res) => {
  try {
    const { memoryId } = req.query;

    // Validate ID format
    if (!memoryId) {
      return res.status(400).json({ message: "Invalid memory ID " });
    }

    // Fetch memory
    const memory = await Memory.findById(memoryId).lean();

    if (!memory) {
      return res.status(404).json({ message: "Memory not found" });
    }

    res.status(200).json({
      success: true,
      memory,
    });
  } catch (error) {
    console.error("Error fetching memory:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching memory",
    });
  }
};

// @desc    Get memory collections by ID
// @route   GET /api/memories/:memoryId
// @access  Protected
const fetchMemoryCollections = async (req, res) => {
  try {
    const { generateFolderCover } = req.query;
    const userId = req.user.id;

    //fetching memory list
    const user = await fetchNativeUserData({
      id: userId,
      fields: ["memoryList", "role"],
      callSign: "universe"
    })
    const memoryUsers = await getUserMetaMap(user.memoryList, [
      "name",
      "image",
      "course"
    ]);

    //fetching template folders
    const folderResult = generateFolderCover
      ? await fetchTemplateCover({ userId })
      : [];

    //fetching top certificates
    const certificates = await Memory.find({
      createdBy: new mongoose.Types.ObjectId(userId),
      certificate: { $exists: true, $ne: "" },
    })
      .sort({ date: -1 })
      .limit(4)
      .select("title certificate assets date")
      .lean();

    return res.status(StatusCodes.OK).json({
      memoryList: memoryUsers.slice(0, 6),
      folders: folderResult,
      certificates,
    });
  } catch (error) {
    console.error("Error fetching collections:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching collections",
    });
  }
};

// @desc    Get memory collections by ID
// @route   GET /api/memories/:memoryId
// @access  Protected
const getCalendarDataByMonth = async (req, res) => {
  try {
    const userId = req.user.id;
    const { month } = req.query; // expected format: "2025-11"

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return res.status(400).json({
        success: false,
        message: "Month must be in YYYY-MM format",
      });
    }

    const [year, monthNum] = month.split("-").map(Number);

    const calendarData = await fetchCalendarData({
      year,
      monthNum,
      userId,
    });

    return res.status(200).json({
      success: true,
      calendarData,
    });
  } catch (error) {
    console.error("getCalendarDataByMonth error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get memories by date
// @route   GET /api/memories/:date
// @access  Protected
const getMemoriesByDate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { date } = req.query; // expected: YYYY-MM-DD

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({
        success: false,
        message: "Invalid date format. Use YYYY-MM-DD",
      });
    }

    // Create start and end of that day
    const start = new Date(date + "T00:00:00.000Z");
    const end = new Date(date + "T23:59:59.999Z");

    const memories = await Memory.find({
      date: { $gte: start, $lte: end },
      $or: [
        { createdBy: new mongoose.Types.ObjectId(userId) },
        { savedBy: new mongoose.Types.ObjectId(userId) },
      ],
    })
      .sort({ date: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      count: memories.length,
      memories,
    });
  } catch (error) {
    console.error("getMemoriesByDate error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get memories by date
// @route   GET /api/memories/:date
// @access  Protected
const getMemoriesByTemplate = async (req, res) => {
  try {
    const userId = req.user.id;
    const { template } = req.query;

    if (!template) {
      return res.status(400).json({
        success: false,
        message: "Invalid template.",
      });
    }

    const page = Number(req.query.page) || 1;
    const limit = Number(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Count total memories with this template
    const totalMemories = await Memory.countDocuments({
      template,
      $or: [
        { createdBy: new mongoose.Types.ObjectId(userId) },
        { savedBy: new mongoose.Types.ObjectId(userId) },
      ],
    });

    // Fetch paginated memories
    const memories = await Memory.find({
      template,
      $or: [
        { createdBy: new mongoose.Types.ObjectId(userId) },
        { savedBy: new mongoose.Types.ObjectId(userId) },
      ],
    })
      .sort({ date: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    return res.status(200).json({
      success: true,
      page,
      limit,
      totalMemories,
      totalPages: Math.ceil(totalMemories / limit),
      count: memories.length,
      memories,
    });
  } catch (error) {
    console.error("getMemoriesByTemplate error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

// @desc    Get memories by date
// @route   GET /api/memories/:date
// @access  Protected
const searchMemory = async (req, res) => {
  try {
    const userId = req.user.id;
    let { q = "", page = 1, limit = 12 } = req.query;

    q = q.trim();
    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search query cannot be empty.",
      });
    }

    page = Number(page);
    limit = Number(limit);
    const skip = (page - 1) * limit;

    // escape regex
    const safeRegex = q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const searchRegex = new RegExp(safeRegex, "i");

    // -----------------------------
    // MAIN QUERY – includes:
    // - memories I created
    // - memories I saved
    // -----------------------------
    const matchQuery = {
      $and: [
        {
          // Only my memories (created or saved)
          $or: [
            { createdBy: new mongoose.Types.ObjectId(userId) },
            { savedBy: new mongoose.Types.ObjectId(userId) },
          ],
        },
        {
          // Only memories where search term matches something
          $or: [
            { title: searchRegex },
            { caption: searchRegex },
            { template: searchRegex },
            { "creatorMetaData.name": searchRegex },
            { "tags.name": searchRegex },
            { "tags.title": searchRegex },
            {
              $expr: {
                $regexMatch: {
                  input: {
                    $dateToString: { format: "%Y-%m-%d", date: "$date" },
                  },
                  regex: searchRegex,
                },
              },
            },
          ],
        },
      ],
    };

    // -----------------------------
    // AGGREGATION PIPELINE
    // -----------------------------
    const pipeline = [
      { $match: matchQuery },

      // flatten tags for cleaner relevance search
      {
        $addFields: {
          flatTags: {
            $map: {
              input: "$tags",
              as: "t",
              in: { $concat: ["$$t.name", " ", "$$t.title"] },
            },
          },
        },
      },

      // -------- RELEVANCE SCORING ----------
      {
        $addFields: {
          flatTagString: {
            $reduce: {
              input: {
                $map: {
                  input: "$tags",
                  as: "t",
                  in: {
                    $concat: [
                      { $ifNull: ["$$t.name", ""] },
                      " ",
                      { $ifNull: ["$$t.title", ""] },
                    ],
                  },
                },
              },
              initialValue: "",
              in: { $concat: ["$$value", " ", "$$this"] },
            },
          },
        },
      },
      {
        $addFields: {
          relevance: {
            $sum: [
              {
                $cond: [
                  { $regexMatch: { input: "$title", regex: searchRegex } },
                  6,
                  0,
                ],
              },
              {
                $cond: [
                  { $regexMatch: { input: "$caption", regex: searchRegex } },
                  5,
                  0,
                ],
              },
              {
                $cond: [
                  {
                    $regexMatch: {
                      input: "$creatorMetaData.name",
                      regex: searchRegex,
                    },
                  },
                  4,
                  0,
                ],
              },
              {
                $cond: [
                  { $regexMatch: { input: "$template", regex: searchRegex } },
                  3,
                  0,
                ],
              },
              {
                $cond: [
                  {
                    $regexMatch: {
                      input: "$flatTagString",
                      regex: searchRegex,
                    },
                  },
                  2,
                  0,
                ],
              },
              {
                $cond: [
                  {
                    $regexMatch: {
                      input: {
                        $dateToString: { format: "%Y-%m-%d", date: "$date" },
                      },
                      regex: searchRegex,
                    },
                  },
                  1,
                  0,
                ],
              },
            ],
          },
        },
      },
      // highest relevance → newest memory
      { $sort: { relevance: -1, createdAt: -1 } },

      { $skip: skip },
      { $limit: limit },

      {
        $project: {
          _id: 1,
          title: 1,
          caption: 1,
          template: 1,
          date: 1,
          createdAt: 1,
          tags: 1,
          assets: 1,
          createdBy: 1,
          savedBy: 1,
          creatorMetaData: 1,
          relevance: 1,
        },
      },
    ];

    const results = await Memory.aggregate(pipeline);
    const totalResults = await Memory.countDocuments(matchQuery);

    return res.status(200).json({
      success: true,
      totalResults,
      page,
      totalPages: Math.ceil(totalResults / limit),
      results,
    });
  } catch (error) {
    console.error("searchMemory error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error during search.",
    });
  }
};

const getFriendLinkedMemories = async (req, res) => {
  try {
    const myId = req.user.id;
    const { friendId, page = 1, limit = 10 } = req.query;

    if (!friendId) {
      return res.status(400).json({
        success: false,
        message: "Friend ID is required",
      });
    }

    const pageNum = Number(page);
    const limitNum = Number(limit);
    const skip = (pageNum - 1) * limitNum;

    // ---------------------------
    // CONDITIONS
    // ---------------------------

    // A) Memories I saved that THEY created
    const conditionA = {
      createdBy: new mongoose.Types.ObjectId(friendId),
      savedBy: new mongoose.Types.ObjectId(myId),
    };

    // B) Memories I created where THEY are tagged
    // tags._id stores the tagged user's ID (string)
    const conditionB = {
      createdBy: new mongoose.Types.ObjectId(myId),
      "tags._id": friendId,
    };

    // ---------------------------
    // COMBINED QUERY (A OR B)
    // ---------------------------
    const query = {
      $or: [conditionA, conditionB],
    };

    // ---------------------------
    // FETCH DATA
    // ---------------------------
    const memories = await Memory.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .lean();

    // Count for pagination
    const total = await Memory.countDocuments(query);

    return res.status(200).json({
      success: true,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      memories,
    });
  } catch (error) {
    console.error("getFriendLinkedMemories error:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching friend-linked memories.",
    });
  }
};

const getMonthlyMedia = async (req, res) => {
  try {
    const { userId, page = 1, limit = 1 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const monthlyMedia = await getMonthlyMediaPaginated({
      userId,
      page: Number(page),
      limit: Number(limit),
    });

    return res.json({
      success: true,
      page: Number(page),
      limit: Number(limit),
      data: monthlyMedia,
    });
  } catch (err) {
    console.error("getMonthlyMediaController error:", err);
    return res.status(500).json({
      success: false,
      error: "Internal Server Error",
      details: err.message,
    });
  }
};

const getCertificateMemories = async (req, res) => {
  try {
    const userId = req.user.id;
    const { page = 1, limit = 10 } = req.query;

    if (!userId) {
      return res.status(400).json({ error: "userId is required" });
    }

    const pageNum = parseInt(page);
    const limitNum = parseInt(limit);
    const skip = (pageNum - 1) * limitNum;

    // Filter only certificate memories
    const matchStage = {
      createdBy: new mongoose.Types.ObjectId(userId),
      certificate: { $exists: true, $ne: "" },
    };

    // Count total docs for pagination
    const total = await Memory.countDocuments(matchStage);

    // Fetch paginated result
    const memories = await Memory.find(matchStage)
      .sort({ date: -1 }) // newest first
      .skip(skip)
      .limit(limitNum)
      .lean();

    const hasMore = skip + memories.length < total;

    return res.json({
      page: pageNum,
      total,
      hasMore,
      memories,
    });
  } catch (err) {
    console.error("getCertificateMemories error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getMemoryCount = async (req, res) => {
  try {
    const { userId } = req.query;

    const count = await Memory.countDocuments({ $or: [{ createdBy: userId }, { savedBy: userId }] });

    return res.status(StatusCodes.OK).json({ success: true, data: count })

  } catch (err) {
    console.log("Error getting memory count:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, msg: "Something went wrong!" })
  }
}

const insertNewFields = async (req, res) => {
  try {
    const allmemories = await Memory.find({});

    const bulkOps = allmemories.map((memory) => ({
      updateOne: {
        filter: { _id: memory._id },
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
              lng: 75.70361
            },
          },
        },
      },
    }));

    const result = await Memory.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} memories`);

    res.status(200).json({
      message: "Memories updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

const getMemoryRequest = async (req, res) => {
  try {
    const userId = req.user.id;

    const user = await fetchNativeUserData({
      id: userId,
      fields: ["memoryRequests"],
      callSign: "universe"
    })

    const memories = await Memory.find({ _id: { $in: user.memoryRequests } }).sort({ createdAt: -1 }).lean();

    return res.status(StatusCodes.OK).json({ memories })

  } catch (err) {
    console.log("Error getting memory request:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, msg: "Something went wrong!" })
  }
}

module.exports = {
  createMemory,
  getMemories,
  getOthersMemories,
  editMemory,
  removeMemoryRequest,
  saveMemoryRequest,
  unsaveMemoryRequest,
  deleteMemory,
  setMemoryPinned,
  getMemoryById,
  fetchMemoryCollections,
  getCalendarDataByMonth,
  getMemoriesByDate,
  getMemoriesByTemplate,
  searchMemory,
  getFriendLinkedMemories,
  getMonthlyMedia,
  getCertificateMemories,
  handleTags, // this function is not used in router, but in event gallery
  getMemoryCount,
  insertNewFields,
  getMemoryRequest
};
