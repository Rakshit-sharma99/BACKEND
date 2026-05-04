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
      allowedDomains,
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
      allowedDomains,
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
      allowedDomains,
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
    universe.allowedDomains = allowedDomains ?? universe.allowedDomains;

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

const searchUniverse = async (req, res) => {
  try {
    const { q, limit = 12 } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        message: "Search query is required",
      });
    }

    const regex = new RegExp(q, "i");

    // 1️⃣ Search your DB first
    let universes = await Universe.find({
      $or: [{ name: regex }, { callSign: regex }, { location: regex }],
    })
      .sort({ rank: 1 })
      .limit(Number(limit))
      .lean(); // ⚡ faster, safer

    // 2️⃣ If already enough → return
    if (universes.length >= limit) {
      return res.status(200).json({
        success: true,
        message: "Search results fetched successfully",
        count: universes.length,
        data: universes,
      });
    }

    const remaining = limit - universes.length;

    // 3️⃣ External API (protected)
    let externalUniversities = [];
    try {
      const uniRes = await axios.get(
        `http://universities.hipolabs.com/search?name=${encodeURIComponent(q)}`,
        {
          timeout: 2000, // ⏱ prevent hanging
          maxContentLength: 2000000,
        },
      );

      externalUniversities = uniRes.data.slice(0, remaining);
    } catch (apiErr) {
      console.warn("Hipolabs API failed:", apiErr.message);
    }

    const enriched = externalUniversities.map((uni) => ({
      uid: null,
      name: uni.name,
      callSign: uni.alpha_two_code || "",
      location: uni.country || "",
      lat: null,
      lng: null,
      rank: 9999,
      logo: uni.domains?.[0]
        ? `https://www.google.com/s2/favicons?sz=64&domain=${uni.domains[0]}`
        : null,
      source: "external",
    }));

    // 4️⃣ Deduplicate by name
    const map = new Map();

    [...universes, ...enriched].forEach((u) => {
      const key = u.name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, u);
      }
    });

    const finalResults = Array.from(map.values()).slice(0, limit);

    return res.status(200).json({
      success: true,
      message: "Search results fetched successfully",
      count: finalResults.length,
      data: finalResults,
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
    const { limit = 5 } = req.query;
    const universes = await Universe.find()
      .sort({
        traffic: -1,
        members: -1,
        ip: -1,
        rank: 1, // lower rank is better
      })
      .limit(Number(limit));

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

const getAllowedDomains = async (req, res) => {
  try {
    const { universeId } = req.query;

    if (!universeId) {
      return res.status(400).json({
        success: false,
        message: "universeId is required",
      });
    }

    const universe = await Universe.findById(universeId, {
      allowedDomains: 1,
    }).lean();

    if (!universe) {
      return res.status(404).json({
        success: false,
        message: "Universe not found",
      });
    }

    return res.status(200).json({
      success: true,
      allowedDomains: universe.allowedDomains || [],
    });
  } catch (err) {
    console.error("Get Allowed Domains Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch allowed domains",
      error: err.message,
    });
  }
};

const getEnrichedUniverseData = async (req, res) => {
  try {
    const { name } = req.query;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "University name is required",
      });
    }

    let lat = null;
    let lng = null;
    let logo = null;
    let callSign = "";
    let location = "";

    // 1️⃣ Fetch from Hipolabs for domain (logo), callSign, location
    try {
      const uniRes = await axios.get(
        `http://universities.hipolabs.com/search?name=${encodeURIComponent(
          name,
        )}`,
        { timeout: 5000 },
      );

      if (uniRes.data && uniRes.data.length > 0) {
        // Find exact match or use the first result
        const exactMatch = uniRes.data.find(
          (u) => u.name.toLowerCase() === name.toLowerCase(),
        );
        const uni = exactMatch || uniRes.data[0];

        callSign = uni.alpha_two_code || "";
        location = uni.country || "";
        if (uni.domains && uni.domains.length > 0) {
          logo = `https://www.google.com/s2/favicons?sz=64&domain=${uni.domains[0]}`;
        }
      }
    } catch (apiErr) {
      console.warn(`Hipolabs API failed for ${name}:`, apiErr.message);
    }

    // 2️⃣ Fetch coordinates from Nominatim
    try {
      const geoRes = await axios.get(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
          name,
        )}&format=json&limit=1`,
        {
          headers: {
            "User-Agent": "MultiverseBackend/1.0",
          },
          timeout: 5000,
        },
      );

      if (geoRes.data && geoRes.data.length > 0) {
        lat = parseFloat(geoRes.data[0].lat);
        lng = parseFloat(geoRes.data[0].lon);
      }
    } catch (geoErr) {
      console.warn(`Geocoding failed for ${name}:`, geoErr.message);
    }

    const enrichedData = {
      name,
      callSign,
      location,
      lat,
      lng,
      logo,
      source: "external",
    };

    return res.status(200).json({
      success: true,
      message: "Enriched universe data fetched successfully",
      data: enrichedData,
    });
  } catch (err) {
    console.error("Get Enriched Universe Data Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch enriched universe data",
      error: err.message,
    });
  }
};

const getUniverseByCallSign = async (req, res) => {
  try {
    const { callSign } = req.query;

    if (!callSign) {
      return res.status(400).json({
        success: false,
        message: "Call sign is required",
      });
    }

    const universe = await Universe.findOne({ callSign });

    if (!universe) {
      return res.status(404).json({
        success: false,
        message: "Universe not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Universe fetched successfully",
      universe,
    });
  } catch (err) {
    console.error("Get Universe By Call Sign Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch universe",
      error: err.message,
    });
  }
};

const getUniversesByIds = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "An array of universe IDs is required",
      });
    }

    // Cap to prevent abuse
    const cappedIds = ids.slice(0, 50);

    const universes = await Universe.find(
      { $or: [{ _id: { $in: cappedIds } }, { callSign: { $in: cappedIds } }] },
      { name: 1, callSign: 1, location: 1, logo: 1, logoKey: 1, lat: 1, lng: 1 },
    ).lean();

    return res.status(200).json({
      success: true,
      data: universes,
    });
  } catch (err) {
    console.error("Get Universes By IDs Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch universes by IDs",
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
  getAllowedDomains,
  getEnrichedUniverseData,
  getUniverseByCallSign,
  getUniversesByIds,
};
