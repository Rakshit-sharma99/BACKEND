const { STATUS_CODES } = require("http");
const User = require("../models/user");
const { default: mongoose } = require("mongoose");

const getUserFieldsById = async (req, res) => {
  try {
    const { id, fields } = req.body;

    if (!id) {
      return res.status(400).json({ error: "User ID is required." });
    }

    if (!fields || !Array.isArray(fields) || fields.length === 0) {
      return res.status(400).json({ error: "An array of fields is required." });
    }

    // Convert array of fields to space-separated string for Mongoose projection
    const projection = fields.join(" ");

    const user = await User.findById(id).select(projection);

    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    return res.status(200).json({ data: user });
  } catch (err) {
    console.error("Error fetching user fields:", err);
    return res.status(500).json({ error: "Server error" });
  }
};

const getUsersWithDynamicQuery = async (req, res) => {
  try {
    const { filter, projection } = req.body;

    // Validate that `filter` is an object
    if (!filter || typeof filter !== "object") {
      return res
        .status(400)
        .json({ error: "Invalid or missing filter object." });
    }

    // Projection can be either an object (recommended) or a string
    const users = await User.find(filter, projection || {}).limit(6);

    return res.status(200).json({ data: users });
  } catch (error) {
    console.error("Error fetching users with dynamic query:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

const fetchBulkUsers = async (req, res) => {
  try {
    const { userIds, fields = [] } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: "User IDs are required." });
    }

    const projection = fields.reduce((acc, field) => {
      acc[field] = 1;
      return acc;
    }, {});

    const objectIds = userIds
      .map((id) =>
        mongoose.Types.ObjectId.isValid(id)
          ? new mongoose.Types.ObjectId(id)
          : null
      )
      .filter(Boolean);

    if (objectIds.length === 0) {
      return res.status(400).json({ error: "No valid user IDs provided." });
    }

    const users = await User.find({ _id: { $in: objectIds } }, projection);

    return res.status(200).json(users);
  } catch (error) {
    console.error("Error fetching users in bulk:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

const insertNewFields = async (req, res) => {
  try {
    const allUsers = await User.find({});

    const bulkOps = allUsers.map((user) => ({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            uid: "682f0418482d651a6df66c23",
            universeMetaData: {
              location: "Phagwara,Punjab,India",
              logo: "public/universes/lpu_logo.jpg",
              name: "Lovely Professional University",
              callSign: "universe",
            },
          },
        },
      },
    }));

    const result = await User.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} users`);

    res.status(200).json({
      message: "Users updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = {
  getUserFieldsById,
  getUsersWithDynamicQuery,
  insertNewFields,
  fetchBulkUsers,
};
