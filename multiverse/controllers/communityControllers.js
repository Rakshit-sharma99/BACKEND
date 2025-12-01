const { default: mongoose } = require("mongoose");
const Community = require("../models/community");

const getCommunityFieldsById = async (req, res) => {
  try {
    const { id, fields } = req.body;

    if (!id) {
      return res.status(400).json({ error: "Community ID is required." });
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: "An array of fields is required." });
    }

    // Convert array of fields to space-separated string for Mongoose projection
    const projection = fields.join(" ");

    const community = await Community.findById(id).select(projection);

    if (!community) {
      return res.status(404).json({ error: "Community not found." });
    }

    return res.status(200).json({ data: community });
  } catch (err) {
    console.error("Error fetching community fields:", err);
    return res.status(500).json({ error: "Server error" });
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
      { $sample: { size: 6 } }
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
      projection
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

module.exports = {
  getCommunityFieldsById,
  getCommunitiesRecommendation,
  fetchMultipleCommunitiesFromIds,
  searchCommunitiesWithRegex,
};
