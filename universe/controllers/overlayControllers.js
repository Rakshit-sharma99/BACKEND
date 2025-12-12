const mongoose = require("mongoose");
const Overlay = require("../models/overlay");
const User = require("../models/user");
const Ticket = require("../models/ticket");

const createOverlay = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    const { title, aspectRatio, cover, buttons } = req.body;

    // Basic validation
    if (!cover) {
      return res.status(400).json({ error: "Cover image is required" });
    }

    // Validate button structure if provided
    if (buttons && !Array.isArray(buttons)) {
      return res.status(400).json({ error: "Buttons must be an array" });
    }

    const overlay = new Overlay({
      title,
      aspectRatio,
      cover,
      buttons: buttons || [],
    });

    await overlay.save();

    res.status(201).json({
      message: "Overlay created successfully",
      overlay,
    });
  } catch (err) {
    console.error("Error creating overlay:", err);
    res.status(500).json({ error: "Server error" });
  }
};

const getOverlayById = async (req, res) => {
  try {
    const { id } = req.query;

    // Fetch overlay
    const overlay = await Overlay.findById(id).lean();

    if (!overlay) {
      return res
        .status(404)
        .json({ success: false, message: "Overlay not found" });
    }

    return res.status(200).json({ success: true, data: overlay });
  } catch (error) {
    console.error("Error fetching overlay:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const addOverlayToUsers = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    const { userIds, overlayId } = req.body;

    if (!Array.isArray(userIds) || !overlayId) {
      return res
        .status(400)
        .json({ error: "userIds (array) and overlayId are required" });
    }

    // Convert overlayId to ObjectId if needed
    const overlayObjectId = new mongoose.Types.ObjectId(overlayId);

    // Update all users in one go
    const result = await User.updateMany(
      { _id: { $in: userIds } },
      { $addToSet: { overlays: overlayObjectId } } // addToSet prevents duplicates
    );

    res.status(200).json({
      success: true,
      matched: result.matchedCount,
      modified: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error adding overlay to users:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const handleOverlayButtonPress = async (req, res) => {
  try {
    const userId = req.user.id; // extracted from auth middleware
    const { overlayId, actionType } = req.body;

    if (!overlayId || !actionType) {
      return res
        .status(400)
        .json({ error: "overlayId and label are required" });
    }

    const overlayObjectId = new mongoose.Types.ObjectId(overlayId);

    // 1. Insert stats record in overlay
    await Overlay.findByIdAndUpdate(
      overlayObjectId,
      {
        $push: {
          stats: {
            userId: new mongoose.Types.ObjectId(userId),
            actionType,
          },
        },
      },
      { new: true }
    );

    // 2. Remove overlayId from user schema
    await User.findByIdAndUpdate(
      userId,
      { $pull: { overlays: overlayObjectId } },
      { new: true }
    );

    res.status(200).json({
      success: true,
      message: "Button press logged and overlay removed from user",
    });
  } catch (error) {
    console.error("Error handling overlay button press:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const addOverlayToTicketBuyers = async (req, res) => {
  try {
    const { overlayId, eventId } = req.body;

    // Find tickets and extract buyer IDs
    const tickets = await Ticket.find({
      eventId: mongoose.Types.ObjectId(eventId),
    }).lean();

    const buyerIds = tickets.map((t) => t.boughtBy).filter(Boolean);

    if (!buyerIds.length) {
      return res.status(404).json({ msg: "No buyers found for this event" });
    }

    // Update users with $addToSet
    const usersUpdate = await User.updateMany(
      { _id: { $in: buyerIds } },
      { $addToSet: { overlays: overlayId } }
    );

    return res.status(200).json({ msg: "Overlay added", usersUpdate });
  } catch (error) {
    console.error("Error handling overlay:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

const addOverlayToAllUsers = async (req, res) => {
  try {
    const { overlayId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(overlayId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid overlay ID",
      });
    }

    // Use $addToSet to prevent duplicates
    const result = await User.updateMany(
      {},
      { $addToSet: { overlays: overlayId } }
    );

    return res.status(200).json({
      success: true,
      message: "Overlay added to all users successfully",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error adding overlay to all users:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const removeOverlayFromAllUsers = async (req, res) => {
  try {
    const { overlayId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(overlayId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid overlay ID",
      });
    }

    // Use $pull to remove the overlayId from all users
    const result = await User.updateMany(
      {},
      { $pull: { overlays: overlayId } }
    );

    return res.status(200).json({
      success: true,
      message: "Overlay removed from all users successfully",
      matchedCount: result.matchedCount,
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error removing overlay from all users:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

module.exports = {
  createOverlay,
  getOverlayById,
  addOverlayToUsers,
  handleOverlayButtonPress,
  addOverlayToTicketBuyers,
  addOverlayToAllUsers,
  removeOverlayFromAllUsers,
};
