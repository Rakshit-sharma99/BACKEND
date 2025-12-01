const mongoose = require("mongoose");
const StatusCodes = require("http-status-codes");
const JoinLink = require("../models/joinLink");

const createJoinLink = async (req, res) => {
  try {
    const { type, belongsTo, expiry, maxUses, accessibleTo } = req.body;

    // Validate type
    if (!["Club", "Community"].includes(type)) {
      return res
        .status(400)
        .json({ error: "Invalid type. Must be 'Club' or 'Community'." });
    }

    // Create join link
    const newJoinLink = new JoinLink({
      type,
      belongsTo,
      expiry: expiry || null,
      maxUses: maxUses ?? -1,
      accessibleTo: accessibleTo || [],
    });

    await newJoinLink.save();

    return res.status(201).json({
      message: "Join link created successfully.",
      joinLink: newJoinLink,
    });
  } catch (err) {
    console.error("Error creating join link:", err);
    return res.status(500).json({ error: "Internal server error." });
  }
};

const getJoinLinkData = async (req, res) => {
  try {
    const { linkId } = req.query;
    const userId = req.user?.id;

    console.log(req.query);

    // 1. Validate linkId
    if (!mongoose.Types.ObjectId.isValid(linkId)) {
      return res
        .status(StatusCodes.BAD_REQUEST)
        .json({ error: "Invalid link ID" });
    }

    // 2. Fetch the join link
    const link = await JoinLink.findById(linkId);
    if (!link) {
      return res
        .status(StatusCodes.NOT_FOUND)
        .json({ error: "Join link not found" });
    }

    // 3. Run usage/access checks
    const canBeUsed = link.canBeUsed(userId);
    if (!canBeUsed) {
      return res
        .status(StatusCodes.FORBIDDEN)
        .json({ error: "This link cannot be used by you." });
    }

    return res.status(StatusCodes.OK).json({
      id: link._id,
      type: link.type,
      belongsTo: link.belongsTo,
      expiry: link.expiry,
      canBeUsed,
    });
  } catch (error) {
    console.error("Error fetching join link:", error);
    return res.status(500).json({ error: "Internal server error." });
  }
};

module.exports = {
  createJoinLink,
  getJoinLinkData,
};
