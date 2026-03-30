const Quest = require("../models/quest");
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");

const createQuest = async (req, res) => {
  try {
    const {
      ip,
      title,
      description,
      isRepeatable,
      available,
      metaData,
      visibleTo,
      mode,
      payload,
      universeMetaData,
    } = req.body;

    // Validate required fields
    if (!ip || !title || !description || !mode || !universeMetaData) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: "Missing required fields.",
      });
    }

    // Create a new quest
    const quest = new Quest({
      ip,
      title,
      description,
      isRepeatable: isRepeatable ?? false,
      available,
      metaData: metaData || {},
      visibleTo: visibleTo || [],
      mode,
      payload: payload || {},
      uid: req.user.uid,
      universeMetaData,
    });

    // Save to database
    await quest.save();

    return res.status(StatusCodes.CREATED).json({
      message: "Quest created successfully.",
      quest,
    });
  } catch (error) {
    console.error("Error creating quest:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Something went wrong while creating the quest.",
      error: error.message,
    });
  }
};

const getValidQuestsForUser = async (userId, options = {}) => {
  const { fallbackToCompleted = true, fallbackLimit = 3 } = options;

  let validQuests = await Quest.find({
    $and: [
      {
        $or: [{ visibleTo: { $size: 0 } }, { visibleTo: userId }],
      },
      { status: 1 },
      {
        $or: [{ isRepeatable: true }, { completedBy: { $ne: userId } }],
      },
      {
        $expr: {
          $lt: [{ $size: "$completedBy" }, "$available"],
        },
      },
    ],
  });

  if (validQuests.length === 0 && fallbackToCompleted) {
    validQuests = await Quest.find({
      $and: [
        {
          $or: [{ visibleTo: { $size: 0 } }, { visibleTo: userId }],
        },
        { status: 1 },
        {
          $expr: {
            $lt: [{ $size: "$completedBy" }, "$available"],
          },
        },
      ],
    }).limit(fallbackLimit);
  }

  return validQuests;
};

const findValidQuests = async (req, res) => {
  try {
    const userId = new mongoose.Types.ObjectId(req.user.id); // Ensure correct ObjectId format

    // Find quests that meet the conditions
    const validQuests = await getValidQuestsForUser(userId, {
      fallbackToCompleted: false,
    });

    return res.status(StatusCodes.OK).json({
      message: "Valid quests retrieved successfully.",
      quests: validQuests,
    });
  } catch (error) {
    console.error("Error finding valid quests:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: "Something went wrong while retrieving quests.",
      error: error.message,
    });
  }
};

const fetchQuests = async (req, res) => {
  try {
    let { userId } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ error: "Invalid user ID." });
    }

    const quests = await getValidQuestsForUser(
      new mongoose.Types.ObjectId(userId),
    );

    return res.status(200).json({ data: quests });
  } catch (error) {
    console.error("❌ Error in fetchQuests:", error);
    return res
      .status(500)
      .json({ error: "Something went wrong while fetching quests." });
  }
};

const insertNewFields = async (req, res) => {
  try {
    const allQuests = await Quest.find({});

    const bulkOps = allQuests.map((quest) => ({
      updateOne: {
        filter: { _id: quest._id },
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

    const result = await Quest.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} Quests`);

    res.status(StatusCodes.OK).json({
      message: "Quests updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (err) {
    console.log("Error updating quests:", err);
    res
      .status(StatusCodes.INTERNAL_SERVER_ERROR)
      .json({ error: "Internal server error" });
  }
};

module.exports = {
  createQuest,
  findValidQuests,
  fetchQuests,
  insertNewFields,
};
