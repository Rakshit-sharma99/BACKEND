const CustomUniverse = require("../models/customUniverse");

const createCustomUniverse = async (req, res) => {
  try {
    const { name, country, province, city, contact, images, userId } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized: User ID is required",
      });
    }

    const customUniverse = await CustomUniverse.create({
      name,
      country,
      province,
      city,
      contact,
      images,
      createdBy: userId,
    });

    return res.status(201).json({
      success: true,
      message: "Custom Universe created successfully",
      data: customUniverse,
    });
  } catch (err) {
    console.error("Create Custom Universe Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to create custom universe",
      error: err.message,
    });
  }
};

const getAllCustomUniverses = async (req, res) => {
  try {
    if (req.user && req.user.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "You are not authorized to access this route.",
      });
    }

    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const customUniverses = await CustomUniverse.find()
      .sort({ createdAt: -1 })
      .skip(Number(skip))
      .limit(Number(limit));

    const total = await CustomUniverse.countDocuments();

    return res.status(200).json({
      success: true,
      message: "Custom universes fetched successfully",
      meta: {
        total,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(total / limit),
      },
      data: customUniverses,
    });
  } catch (err) {
    console.error("Get All Custom Universes Error:", err);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch custom universes",
      error: err.message,
    });
  }
};

module.exports = {
  createCustomUniverse,
  getAllCustomUniverses,
};
