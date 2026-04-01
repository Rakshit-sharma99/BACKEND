const Quest = require("../models/quest");
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");

const createQuest = async (req, res) => {
  try {
    const {
      orbit,
      title,
      description,
      logo,
      secondaryLogo,
      entity,
      metric,
      type,
      entityLimit = 1,
      target,
      ip,
    } = req.body;

    if (!title || !entity || !metric || !type || !target || !ip) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Missing required fields (title/entity/metric/type/target/ip)",
      });
    }

    const validEntities = ["Club", "Community", "Event", "Member"];
    const validTypes = ["continuous", "discrete"];

    if (!validEntities.includes(entity)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Invalid entity" });
    }

    if (!validTypes.includes(type)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "Invalid type" });
    }

    if (target <= 0 || ip <= 0 || entityLimit < 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "target, ip must be > 0; entityLimit must be >= 0",
      });
    }

    if (orbit && orbit.id && typeof orbit.id !== "number") {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Orbit id must be a number",
      });
    }

    const existing = await Quest.findOne({
      title: title.trim(),
      metric,
      entity,
      "orbit.id": orbit?.id,
    });

    if (existing) {
      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        message: "Quest already exists in this orbit",
      });
    }

    let finalType = type;
    let finalEntityLimit = entityLimit;

    const lowerMetric = metric.toLowerCase();
    if (lowerMetric.includes("total") || lowerMetric.includes("created")) {
      finalType = "continuous";
      finalEntityLimit = 0;
    } else if (entityLimit > 1) {
      finalType = "discrete";
    }

    const quest = await Quest.create({
      orbit,
      title: title.trim(),
      description,
      logo,
      secondaryLogo,
      entity,
      metric,
      type: finalType,
      entityLimit: finalEntityLimit,
      target,
      ip,
    });

    res.status(StatusCodes.CREATED).json({ success: true, data: quest });
  } catch (err) {
    console.error("createQuest error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "Failed to create quest" });
  }
};

const createMultipleQuest = async (req, res) => {
  try {
    const { quests } = req.body;

    if (!Array.isArray(quests) || quests.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "quests must be a non-empty array",
      });
    }

    const validEntities = ["Club", "Community", "Event", "Member"];
    const validTypes = ["continuous", "discrete"];

    const errors = [];
    const validQuests = [];

    for (let i = 0; i < quests.length; i++) {
      const q = quests[i];

      if (!q.title || !q.entity || !q.metric || !q.type || !q.target || !q.ip) {
        errors.push(`Quest ${i}: missing required fields`);
        continue;
      }

      if (!validEntities.includes(q.entity)) {
        errors.push(`Quest ${i}: invalid entity`);
        continue;
      }

      if (!validTypes.includes(q.type)) {
        errors.push(`Quest ${i}: invalid type`);
        continue;
      }

      if (q.target <= 0 || q.ip <= 0) {
        errors.push(`Quest ${i}: invalid numeric values`);
        continue;
      }

      if (q.orbit && q.orbit.id && typeof q.orbit.id !== "number") {
        errors.push(`Quest ${i}: orbit id must be number`);
        continue;
      }

      let finalType = q.type;
      let finalEntityLimit = q.entityLimit || 1;

      const lowerMetric = q.metric.toLowerCase();
      if (lowerMetric.includes("total") || lowerMetric.includes("created")) {
        finalType = "continuous";
        finalEntityLimit = 0;
      } else if (finalEntityLimit > 1) {
        finalType = "discrete";
      }

      validQuests.push({
        ...q,
        title: q.title.trim(),
        type: finalType,
        entityLimit: finalEntityLimit,
      });
    }

    if (errors.length > 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, errors });
    }

    const existing = await Quest.find({
      $or: validQuests.map((q) => ({
        title: q.title,
        metric: q.metric,
        entity: q.entity,
        "orbit.id": q.orbit?.id,
      })),
    });

    const existingSet = new Set(
      existing.map((e) => `${e.title}-${e.metric}-${e.entity}-${e.orbit?.id}`)
    );

    const filtered = validQuests.filter(
      (q) => !existingSet.has(`${q.title}-${q.metric}-${q.entity}-${q.orbit?.id}`)
    );

    if (filtered.length === 0) {
      return res.status(StatusCodes.CONFLICT).json({ success: false, message: "All quests already exist" });
    }

    const created = await Quest.insertMany(filtered);

    res.status(StatusCodes.CREATED).json({
      success: true,
      createdCount: created.length,
      skipped: validQuests.length - created.length,
      data: created,
    });
  } catch (err) {
    console.error("createMultipleQuest error:", err);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "Batch creation failed" });
  }
};

const getAllActiveQuests = async (req, res) => {
  try {
    const quests = await Quest.find({ is_active: true }).lean();

    return res.status(StatusCodes.OK).json({
      success: true,
      quests,
    });
  } catch (err) {
    console.error("getAllActiveQuests error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch active quests",
    });
  }
};

const getQuestsByIds = async (req, res) => {
  try {
    let { questIds } = req.body;

    if (!questIds) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "questIds in body required" });
    }

    if (typeof questIds === "string") {
      questIds = questIds.split(",").map((id) => id.trim());
    }

    const validIds = questIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, message: "No valid quest IDs provided" });
    }

    const quests = await Quest.find({ _id: { $in: validIds } }).lean();

    return res.status(StatusCodes.OK).json({ success: true, quests });
  } catch (err) {
    console.error("getQuestsByIds error:", err);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch quests by IDs",
    });
  }
};

module.exports = {
  createQuest,
  createMultipleQuest,
  getAllActiveQuests,
  getQuestsByIds,
};