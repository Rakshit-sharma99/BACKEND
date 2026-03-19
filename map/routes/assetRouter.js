const express = require("express");
const router = express.Router();

const {
  createAsset,
  editAsset,
  deleteAsset,
  getAssetById,
  getAllAssetsByType,
  searchSongs,
  getSongRecommendations,
  searchBooks,
  getBookRecommendations,
  searchMovies,
  getMovieRecommendations,
  getMovieDetails,
  bulkUpdateTags,
  getMultipleAssets,
} = require("../controllers/assetControllers");

router.post("/createAsset", createAsset);
router.put("/editAsset", editAsset);
router.delete("/deleteAsset", deleteAsset);
router.get("/getAssetById", getAssetById);
router.get("/getAllAssetsByType", getAllAssetsByType);
router.put("/bulkUpdateTags", bulkUpdateTags);

router.get("/searchSongs", searchSongs);
router.get("/getSongRecommendations", getSongRecommendations);

router.get("/searchBooks", searchBooks);
router.get("/getBookRecommendations", getBookRecommendations);

router.get("/searchMovies", searchMovies);
router.get("/getMovieRecommendations", getMovieRecommendations);
router.get("/getMovieDetails", getMovieDetails);

router.post("/getMultipleAssets", getMultipleAssets);

module.exports = router;
