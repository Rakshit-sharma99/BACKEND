const { StatusCodes } = require("http-status-codes");
const Block = require("../models/block");
const resolvers = require("../controllers/blockControllersUtility/resolvers");

const getBlocksForPage = async (req, res) => {
  try {
    const { pageName, page = 1, limit = 5 } = req.query;
    const { cachedKeys = [] } = req.body;

    if (!pageName) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "pageName is required",
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    // total count for pagination info
    const totalBlocks = await Block.countDocuments({
      pageName,
      isActive: true,
    });

    // Apply pagination
    let blocks = await Block.find({ pageName, isActive: true })
      .sort({ order: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    blocks = blocks.filter((b) => !(cachedKeys || []).includes(b));

    const output = [];

    for (const block of blocks) {
      const resolver = resolvers[block.uiSignature];

      let data = null;

      if (resolver && !cachedKeys.includes(block.uiSignature)) {
        try {
          data = await resolver(block, req.user.id);
        } catch (resolverErr) {
          console.error("Resolver error for:", block.uiSignature, resolverErr);
        }
      }

      if (cachedKeys.includes(block.uiSignature)) {
        output.push({
          uiSignature: block.uiSignature,
          order: block.order,
          data: "cached",
          cacheTime: block.cacheTime,
        });
      }

      if (data) {
        output.push({
          uiSignature: block.uiSignature,
          order: block.order,
          data,
          cacheTime: block.cacheTime,
        });
      }
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      pageName,
      pagination: {
        total: totalBlocks,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(totalBlocks / limit),
        hasNextPage: skip + blocks.length < totalBlocks,
        hasPrevPage: page > 1,
      },
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
