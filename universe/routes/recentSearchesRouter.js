const express = require("express");
const {
  createARecentSearch,
  getAllRecentSearches,
  getSearchesByType,
  deleteRecentSearch
} = require("../controllers/recentSearchesControllers");

const router = express.Router();

router.post("/createARecentSearch", createARecentSearch);
router.get("/getAllRecentSearches", getAllRecentSearches);
router.get("/getSearchesByType", getSearchesByType);
router.delete("/deleteRecentSearch", deleteRecentSearch);



module.exports = router;
