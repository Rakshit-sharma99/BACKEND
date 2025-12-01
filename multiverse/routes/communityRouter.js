const express = require("express");
const router = express.Router();

const {
  getCommunityFieldsById,
  getCommunitiesRecommendation,
  fetchMultipleCommunitiesFromIds,
  searchCommunitiesWithRegex,
} = require("../controllers/communityControllers");

router.post("/getCommunityFieldsById", getCommunityFieldsById);
router.post("/getCommunitiesRecommendation", getCommunitiesRecommendation);
router.post("/searchCommunitiesWithRegex", searchCommunitiesWithRegex);
router.post(
  "/fetchMultipleCommunitiesFromIds",
  fetchMultipleCommunitiesFromIds
);

module.exports = router;
