const Quest = require("../models/quest");
const mongoose = require("mongoose");
const { StatusCodes } = require("http-status-codes");

// ────────────────────────────────────────────────────────────────────────────
// Create single quest
// ────────────────────────────────────────────────────────────────────────────
const createQuest = async (req, res) => {
  try {
    const {
      orbit,
      title,
      description,
      logo,
      secondaryLogo,
      category,
      metric,
      type,
      numOfEntities = 1,
      target,
      ip,
    } = req.body;

    if (!orbit || !orbit.id || !title || !category || !metric || !type || !target || !ip) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields (orbit/title/category/metric/type/target/ip)",
      });
    }

    const validCategories = ["Club", "Community", "Event"];
    const validTypes = ["continuous", "discrete"];

    if (!validCategories.includes(category)) {
      return res.status(400).json({ success: false, message: "Invalid category" });
    }

    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: "Invalid type" });
    }

    if (target <= 0 || ip <= 0 || numOfEntities < 1) {
      return res.status(400).json({
        success: false,
        message: "target, ip must be > 0; numOfEntities must be >= 1",
      });
    }

    if (typeof orbit.id !== "number") {
      return res.status(400).json({
        success: false,
        message: "Orbit id must be a number",
      });
    }

    const existing = await Quest.findOne({
      title: title.trim(),
      metric,
      category,
      "orbit.id": orbit.id,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Quest already exists in this orbit",
      });
    }

    const quest = await Quest.create({
      orbit,
      title: title.trim(),
      description,
      logo,
      secondaryLogo,
      category,
      metric,
      type,
      numOfEntities,
      target,
      ip,
    });

    res.status(201).json({ success: true, data: quest });
  } catch (err) {
    console.error("createQuest error:", err);
    res.status(500).json({ success: false, message: "Failed to create quest" });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Create multiple quests (batch)
// ────────────────────────────────────────────────────────────────────────────
const createMultipleQuest = async (req, res) => {
  try {
    const { quests } = req.body;

    if (!Array.isArray(quests) || quests.length === 0) {
      return res.status(400).json({
        success: false,
        message: "quests must be a non-empty array",
      });
    }

    const validCategories = ["Club", "Community", "Event"];
    const validTypes = ["continuous", "discrete"];

    const errors = [];
    const validQuests = [];

    for (let i = 0; i < quests.length; i++) {
      const q = quests[i];

      if (!q.orbit || !q.orbit.id || !q.title || !q.category || !q.metric || !q.type || !q.target || !q.ip) {
        errors.push(`Quest ${i}: missing required fields`);
        continue;
      }

      if (!validCategories.includes(q.category)) {
        errors.push(`Quest ${i}: invalid category`);
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

      if (typeof q.orbit.id !== "number") {
        errors.push(`Quest ${i}: orbit id must be number`);
        continue;
      }

      validQuests.push({
        ...q,
        title: q.title.trim(),
        numOfEntities: q.numOfEntities || 1,
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({ success: false, errors });
    }

    // Duplicate check (existing)
    const existing = await Quest.find({
      $or: validQuests.map((q) => ({
        title: q.title,
        metric: q.metric,
        category: q.category,
        "orbit.id": q.orbit.id,
      })),
    });

    const existingSet = new Set(
      existing.map((e) => `${e.title}-${e.metric}-${e.category}-${e.orbit.id}`)
    );

    const filtered = validQuests.filter(
      (q) => !existingSet.has(`${q.title}-${q.metric}-${q.category}-${q.orbit.id}`)
    );

    if (filtered.length === 0) {
      return res.status(409).json({ success: false, message: "All quests already exist" });
    }

    const created = await Quest.insertMany(filtered);

    res.status(201).json({
      success: true,
      createdCount: created.length,
      skipped: validQuests.length - created.length,
      data: created,
    });
  } catch (err) {
    console.error("createMultipleQuest error:", err);
    res.status(500).json({ success: false, message: "Batch creation failed" });
  }
};

// ────────────────────────────────────────────────────────────────────────────
// Get all active quests  (called internally by universe on verify)
// GET /quest/api/v1/getAllQuests
// Returns: { success, quests: [ { _id, orbit, title, category, metric, type, numOfEntities, target, ip } ] }
// ────────────────────────────────────────────────────────────────────────────
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

// ────────────────────────────────────────────────────────────────────────────
// Get quests by IDs  (called internally by universe for getQuestsProgress)
// GET /quest/api/v1/getQuestsByIds?questIds=id1,id2,...
// Returns: { success, quests: [...] }
// ────────────────────────────────────────────────────────────────────────────
const getQuestsByIds = async (req, res) => {
  try {
    let { questIds } = req.query;

    if (!questIds) {
      return res.status(400).json({ success: false, message: "questIds query param required" });
    }

    // Support comma-separated or array
    if (typeof questIds === "string") {
      questIds = questIds.split(",").map((id) => id.trim());
    }

    const validIds = questIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (validIds.length === 0) {
      return res.status(400).json({ success: false, message: "No valid quest IDs provided" });
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