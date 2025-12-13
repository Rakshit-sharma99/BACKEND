const { StatusCodes } = require("http-status-codes");
const Block = require("../models/block");
const resolvers = require("../controllers/blockControllersUtility/resolvers");

const getBlocksForPage = async (req, res) => {
  try {
    const { pageName } = req.query;

    if (!pageName) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "pageName is required",
      });
    }

    // Find all active blocks for the page
    const blocks = await Block.find({ pageName, isActive: true })
      .sort({ order: 1 })
      .lean();

    const output = [];

    for (const block of blocks) {
      const resolver = resolvers[block.uiSignature];

      let data = null;

      // Run resolver only if exists
      if (resolver) {
        try {
          data = await resolver(block, req.user.id);
        } catch (resolverErr) {
          console.error("Resolver error for:", block.uiSignature, resolverErr);
        }
      }

      output.push({
        uiSignature: block.uiSignature,
        order: block.order,
        payload: block.payload,
        data,
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      pageName,
      blocks: output,
    });
  } catch (error) {
    console.error("Block fetch error:", error);

    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to fetch blocks.",
    });
  }
};

const createBlock = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    const { pageName, uiSignature, order, payload } = req.body;

    // Basic validation
    if (!pageName || !uiSignature) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "pageName and uiSignature are required.",
      });
    }

    // Create block
    const newBlock = await Block.create({
      pageName,
      uiSignature,
      order: order || 0,
      isActive: true,
      payload: payload || [],
    });

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Block created successfully.",
      block: newBlock,
    });
  } catch (error) {
    console.error("Error creating block:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to create block.",
    });
  }
};

const editBlock = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res
        .status(403)
        .send("You are not authorized to access this route.");
    }

    const { blockId } = req.query;

    if (!blockId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "blockId is required",
      });
    }

    const existingBlock = await Block.findById(blockId);
    if (!existingBlock) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Block not found",
      });
    }

    const { pageName, uiSignature, order, isActive, payload } = req.body;

    // Build update object dynamically
    const updateData = {};

    if (pageName !== undefined) updateData.pageName = pageName;
    if (uiSignature !== undefined) updateData.uiSignature = uiSignature;
    if (order !== undefined) updateData.order = order;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (payload !== undefined) updateData.payload = payload;

    const updatedBlock = await Block.findByIdAndUpdate(blockId, updateData, {
      new: true,
      runValidators: true,
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Block updated successfully.",
      block: updatedBlock,
    });
  } catch (error) {
    console.error("Error updating block:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "Failed to update block.",
    });
  }
};

module.exports = { getBlocksForPage, createBlock, editBlock };
