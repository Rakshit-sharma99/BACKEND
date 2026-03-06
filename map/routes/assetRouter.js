const express = require("express");
const router = express.Router();

const {
  createAsset,
  editAsset,
  deleteAsset,
  getAssetById,
  getAllAssetsByType,
} = require("../controllers/assetControllers");

router.post("/createAsset", createAsset);
router.put("/editAsset", editAsset);
router.delete("/deleteAsset", deleteAsset);
router.get("/getAssetById", getAssetById);
router.get("/getAllAssetsByType", getAllAssetsByType);

module.exports = router;
