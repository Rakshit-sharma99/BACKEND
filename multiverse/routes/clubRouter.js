const express = require("express");
const router = express.Router();

const {
  getClubFieldsById,
  getClubsRecommendation,
  fetchMultipleClubsFromIds,
  searchClubsWithRegex,
} = require("../controllers/clubControllers");

router.post("/getClubFieldsById", getClubFieldsById);
router.post("/getClubsRecommendation", getClubsRecommendation);
router.post("/fetchMultipleClubsFromIds", fetchMultipleClubsFromIds);
router.post("/searchClubsWithRegex", searchClubsWithRegex);

module.exports = router;
