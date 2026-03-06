const Asset = require("../models/asset");
const { StatusCodes } = require("http-status-codes");

/**
 * Controller to create a new Asset
 * Only accessible by admin users
 */
const createAsset = async (req, res) => {
  try {
    // ---- Admin Authorization ----
    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "You are not authorized to perform this action.",
      });
    }

    // ---- Parse Request Body ----
    const {
      name,
      description,
      type,
      tag,
      availability,
      url,
      rawData, // In case frontend still passes Lottie JSON configs instead of downloading an S3 url
      price,
      contributorId,
    } = req.body;

    // Validate required fields explicitly
    if (!name || !type || !availability) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Please provide required fields: name, type, and availability",
      });
    }

    // Fallback: Use the admin's _id if contributorId is not explicitly sent in req.body
    const assetContributorId = contributorId || req.user._id;

    // ---- Create Asset ----
    const newAsset = new Asset({
      name,
      description,
      type,
      tag,
      availability,
      url,
      rawData,
      price: price || 0,
      contributorId: assetContributorId,
    });

    await newAsset.save();

    return res.status(StatusCodes.CREATED).json({
      success: true,
      message: "Asset created successfully",
      asset: newAsset,
    });
  } catch (error) {
    console.error("Error creating asset:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while creating the asset.",
      error: error.message,
    });
  }
};

/**
 * Controller to edit an existing Asset
 * Only accessible by admin users
 */
const editAsset = async (req, res) => {
  try {
    const { assetId } = req.query; // Updated to match user's route structure

    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "You are not authorized to perform this action.",
      });
    }

    const updatedAsset = await Asset.findByIdAndUpdate(
      assetId,
      { $set: req.body },
      { new: true, runValidators: true },
    );

    if (!updatedAsset) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Asset not found.",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Asset updated successfully",
      asset: updatedAsset,
    });
  } catch (error) {
    console.error("Error updating asset:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while updating the asset.",
      error: error.message,
    });
  }
};

/**
 * Controller to delete an existing Asset
 * Only accessible by admin users
 */
const deleteAsset = async (req, res) => {
  try {
    const { assetId } = req.query;

    if (req.user.role !== "admin") {
      return res.status(StatusCodes.FORBIDDEN).json({
        success: false,
        message: "You are not authorized to perform this action.",
      });
    }

    const deletedAsset = await Asset.findByIdAndDelete(assetId);

    if (!deletedAsset) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Asset not found.",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      message: "Asset deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting asset:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while deleting the asset.",
      error: error.message,
    });
  }
};

/**
 * Controller to get an Asset by its ID
 */
const getAssetById = async (req, res) => {
  try {
    const { assetId } = req.query;

    if (!assetId) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        message: "Please provide an assetId in the query parameters.",
      });
    }

    const asset = await Asset.findById(assetId);

    if (!asset) {
      return res.status(StatusCodes.NOT_FOUND).json({
        success: false,
        message: "Asset not found.",
      });
    }

    return res.status(StatusCodes.OK).json({
      success: true,
      asset,
    });
  } catch (error) {
    console.error("Error fetching asset:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while fetching the asset.",
      error: error.message,
    });
  }
};

/**
 * Controller to get all assets segregated by their type.
 * Groups assets by the 'type' field, and within those types, further groups by 'tag'.
 */
const getAllAssetsByType = async (req, res) => {
  try {
    // We group by type and the new 'tag' field.
    // If an asset lacks a tag, the tag will be null/undefined in the grouping.
    const segregatedAssets = await Asset.aggregate([
      {
        $group: {
          _id: { type: "$type", tag: "$tag" },
          assets: { $push: "$$ROOT" },
        },
      },
    ]);

    // Format output dynamically:
    // {
    //   "svg": {
    //      "untagged": [{...}, {...}],
    //      "national flags": [{...}]
    //   },
    //   "lottie": { ... }
    // }
    const formattedResult = {};

    segregatedAssets.forEach((group) => {
      const type = group._id.type;
      const tag = group._id.tag;

      // Ensure the type exists in our output object
      if (!formattedResult[type]) {
        formattedResult[type] = { untagged: [] };
      }

      if (tag) {
        // If there's a tag, place the assets in an array named after the tag
        formattedResult[type][tag] = group.assets;
      } else {
        // If no tag, push into the 'untagged' array
        formattedResult[type].untagged.push(...group.assets);
      }
    });

    return res.status(StatusCodes.OK).json({
      success: true,
      data: formattedResult,
    });
  } catch (error) {
    console.error("Error fetching segregated assets:", error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      message: "An error occurred while fetching assets.",
      error: error.message,
    });
  }
};

module.exports = {
  createAsset,
  editAsset,
  deleteAsset,
  getAssetById,
  getAllAssetsByType,
};
