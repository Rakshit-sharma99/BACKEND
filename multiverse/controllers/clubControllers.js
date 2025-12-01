const { default: mongoose } = require("mongoose");
const Club = require("../models/club");

const getClubFieldsById = async (req, res) => {
  try {
    const { id, fields } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Club ID is required." });
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: "An array of fields is required." });
    }

    // Convert array of fields to space-separated string for Mongoose projection
    const projection = fields.join(" ");

    const club = await Club.findById(id).select(projection);

    if (!club) {
      return res.status(404).json({ error: "Club not found." });
    }

    return res.status(200).json({ data: club });
  } catch (err) {
    console.error("Error fetching club fields:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

const getClubsRecommendation = async (req, res) => {
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
          secondaryImg: 1,
          name: 1,
          tags: 1,
          motto: 1,
          _id: 1,
        },
      },
      {
        $sample: { size: 6 },
      }
    );

    const clubs = await Club.aggregate(pipeline);

    return res.status(200).json(clubs);
  } catch (error) {
    console.error("Error fetching club recommendations:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

const fetchMultipleClubsFromIds = async (req, res) => {
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
    const clubs = await Club.find({ _id: { $in: validIds } }).select(
      projection
    );

    return res.status(200).json({ data: clubs });
  } catch (error) {
    console.error("Error fetching clubs:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

const searchClubsWithRegex = async (req, res) => {
  try {
    const { regexPatterns } = req.body;

    const regexes = regexPatterns.map((str) => new RegExp(str, "i"));

    const query = {
      $or: [
        ...regexes.map((r) => ({ name: { $regex: r } })),
        ...regexes.map((r) => ({ motto: { $regex: r } })),
        ...regexes.map((r) => ({ tags: { $regex: r } })),
      ],
    };

    const clubs = await Club.find(query, {
      secondaryImg: 1,
      name: 1,
      tags: 1,
      motto: 1,
      _id: 1,
    });

    return res.status(200).json({ data: clubs });
  } catch (error) {
    console.error("Error searching clubs:", error);
    return res.status(500).json({ error: "Server error" });
  }
};

module.exports = {
  getClubFieldsById,
  getClubsRecommendation,
  fetchMultipleClubsFromIds,
  searchClubsWithRegex,
};
