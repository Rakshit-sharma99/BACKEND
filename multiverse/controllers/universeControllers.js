const Universe = require("../models/universe");

const createUniverse = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }
    const {
      name,
      callSign,
      location,
      lat,
      lng,
      rank,
      traffic,
      clubs,
      communities,
      members,
      ip,
      logo,
      cover,
      logoKey,
      banner,
      event,
      communitiesRecommendation,
      lifecycle,
    } = req.body;

    // Check duplicate callSign
    const existing = await Universe.findOne({ callSign });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: "Universe with this callSign already exists",
      });
    }

    const universe = await Universe.create({
      name,
      callSign,
      location,
      lat,
      lng,
      rank,
      traffic,
      clubs,
      communities,
      members,
      ip,
      logo,
      cover,
      logoKey,
      banner,
      event,
      communitiesRecommendation,
      lifecycle,
    });

    return res.status(201).json({
      success: true,
      message: "Universe created successfully",
      data: universe,
    });
  } catch (err) {
    console.error("Create Universe Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to create universe",
      error: err.message,
    });
  }
};

const editUniverse = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    const { id } = req.params;

    const {
      name,
      callSign,
      location,
      lat,
      lng,
      rank,
      traffic,
      clubs,
      communities,
      members,
      ip,
      logo,
      cover,
      logoKey,
      banner,
      event,
      communitiesRecommendation,
      lifecycle,
    } = req.body;

    const universe = await Universe.findById(id);

    if (!universe) {
      return res.status(404).json({
        success: false,
        message: "Universe not found",
      });
    }

    // If callSign is changed, check duplicate
    if (callSign && callSign !== universe.callSign) {
      const existing = await Universe.findOne({ callSign });
      if (existing) {
        return res.status(409).json({
          success: false,
          message: "Universe with this callSign already exists",
        });
      }
    }

    // Update only provided fields
    universe.name = name ?? universe.name;
    universe.callSign = callSign ?? universe.callSign;
    universe.location = location ?? universe.location;
    universe.lat = lat ?? universe.lat;
    universe.lng = lng ?? universe.lng;
    universe.rank = rank ?? universe.rank;
    universe.traffic = traffic ?? universe.traffic;
    universe.clubs = clubs ?? universe.clubs;
    universe.communities = communities ?? universe.communities;
    universe.members = members ?? universe.members;
    universe.ip = ip ?? universe.ip;
    universe.logo = logo ?? universe.logo;
    universe.cover = cover ?? universe.cover;
    universe.logoKey = logoKey ?? universe.logoKey;
    universe.banner = banner ?? universe.banner;
    universe.event = event ?? universe.event;
    universe.communitiesRecommendation =
      communitiesRecommendation ?? universe.communitiesRecommendation;
    universe.lifecycle = lifecycle ?? universe.lifecycle;

    const updatedUniverse = await universe.save();

    return res.status(200).json({
      success: true,
      message: "Universe updated successfully",
      data: updatedUniverse,
    });
  } catch (err) {
    console.error("Edit Universe Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to update universe",
      error: err.message,
    });
  }
};

const getAllUniverses = async (req, res) => {
  try {
    const { page = 1, limit = 20, sortBy = "rank", order = "asc" } = req.query;

    const skip = (page - 1) * limit;

    const universes = await Universe.find()
      .sort({ [sortBy]: order === "desc" ? -1 : 1 })
      .skip(Number(skip))
      .limit(Number(limit));

    const total = await Universe.countDocuments();

    return res.status(200).json({
      success: true,
      message: "Universes fetched successfully",
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
      data: universes,
    });
  } catch (err) {
    console.error("Get All Universes Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch universes",
      error: err.message,
    });
  }
};

module.exports = { createUniverse, editUniverse, getAllUniverses };
