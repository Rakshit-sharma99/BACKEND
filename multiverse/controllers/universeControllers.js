const Universe = require("../models/universe");
const axios = require("axios");

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

    const { id } = req.query;

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

function dedupeUniverses(list) {
  const seen = new Set();

  return list.filter((u) => {
    const key = `${u.name?.toLowerCase().trim()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const searchUniverse = async (req, res) => {
  try {
    const { q, limit = 12 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    // 1️⃣ Search your DB first
    let universes = await Universe.find({
      $or: [
        { name: { $regex: q, $options: "i" } },
        { callSign: { $regex: q, $options: "i" } },
        { location: { $regex: q, $options: "i" } },
      ],
    })
      .sort({ rank: 1 })
      .limit(Number(limit));

    // 2️⃣ If not enough results → use external APIs
    if (universes.length < limit) {
      const remaining = limit - universes.length;

      // 🔹 Hipolabs
      const uniRes = await axios.get(
        `http://universities.hipolabs.com/search?name=${encodeURIComponent(q)}`,
      );

      const externalUniversities = uniRes.data.slice(0, remaining);

      const enriched = externalUniversities.map((uni) => ({
        uid: null,
        name: uni.name,
        callSign: uni.alpha_two_code || "",
        location: uni.country,
        lat: null,
        lng: null,
        rank: 9999,
        logo: `https://www.google.com/s2/favicons?sz=64&domain=${uni.domains?.[0]}`,
        source: "external",
      }));

      universes = dedupeUniverses([...universes, ...enriched]);
    }

    return res.status(200).json({
      success: true,
      message: "Search results fetched successfully",
      count: universes.length,
      data: universes,
    });
  } catch (err) {
    console.error("Search Universe Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to search universe",
      error: err.message,
    });
  }
};

const getPopularUniverses = async (req, res) => {
  try {
    const universes = await Universe.find()
      .sort({
        traffic: -1,
        members: -1,
        ip: -1,
        rank: 1, // lower rank is better
      })
      .limit(10);

    return res.status(200).json({
      success: true,
      message: "Popular universes fetched successfully",
      count: universes.length,
      data: universes,
    });
  } catch (err) {
    console.error("Get Popular Universes Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch popular universes",
      error: err.message,
    });
  }
};

module.exports = {
  createUniverse,
  editUniverse,
  getAllUniverses,
  searchUniverse,
  getPopularUniverses,
};
