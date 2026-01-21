const mongoose = require("mongoose");
const Overlay = require("../models/overlay");
const { sendKafkaMessage } = require("../config/utils/sendKafkaMessage");
const { fetchTicketFieldsByQuery } = require("./interServiceCall");

const createOverlay = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    const { title, aspectRatio, cover, buttons, universeMetaData } = req.body;

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
      uid: req.user.uid,
      universeMetaData
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

    await sendKafkaMessage("USER_OVERLAY_OPERATION", req.user.callSign, {
      operation: "add",
      targetType: "multiple",
      overlayId,
      userIds
    })

    res.status(200).json({
      success: true
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

    await sendKafkaMessage("USER_OVERLAY_OPERATION", req.user.callSign, {
      operation: "remove",
      targetType: "single",
      overlayId,
      userId
    })

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
    const tickets = await fetchTicketFieldsByQuery({
      searchBy: { eventId: mongoose.Types.ObjectId(eventId) },
      fields: ["boughtBy"],
    });

    const buyerIds = tickets.map((t) => t.boughtBy).filter(Boolean);

    if (!buyerIds.length) {
      return res.status(404).json({ msg: "No buyers found for this event" });
    }

    await sendKafkaMessage("USER_OVERLAY_OPERATION", req.user.callSign, {
      operation: "add",
      targetType: "multiple",
      overlayId,
      userIds: buyerIds
    })

    return res.status(200).json({ msg: "Overlay added" });
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

    await sendKafkaMessage("USER_OVERLAY_OPERATION", req.user.callSign, {
      operation: "add",
      targetType: "all",
      overlayId
    })

    return res.status(200).json({
      success: true,
      message: "Overlay added to all users successfully",
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

    await sendKafkaMessage("USER_OVERLAY_OPERATION", req.user.callSign, {
      operation: "remove",
      targetType: "all",
      overlayId
    })

    return res.status(200).json({
      success: true,
      message: "Overlay removed from all users successfully",
    });
  } catch (error) {
    console.error("Error removing overlay from all users:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const insertNewFields = async (req, res) => {
  try {
    const alloverlays = await Overlay.find({});

    const bulkOps = alloverlays.map((overlay) => ({
      updateOne: {
        filter: { _id: overlay._id },
        update: {
          $set: {
            uid: "696f491a0bfc89b35dc62326",
            universeMetaData: {
              location: "Punjab, India",
              logo: "https://onlytemptestingmacbease.s3.ap-south-1.amazonaws.com/public/universes/lpu_logo-removebg-preview.png",
              logoKey: "public/universes/lpu_logo-removebg-preview.png",
              name: "Lovely Professional University",
              callSign: "LPU",
              lat: 31.25361,
              lng: 75.70361
            },
          },
        },
      },
    }));

    const result = await Overlay.bulkWrite(bulkOps);
    console.log(`Updated ${result.modifiedCount} overlays`);

    res.status(200).json({
      message: "Overlays updated successfully.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
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
  insertNewFields
};
