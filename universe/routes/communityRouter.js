const express = require("express");
const router = express.Router();

const {
  getBatchedContent,
  createCommunity,
  deleteCommunity,
  joinAsMember,
  leaveAsMember,
  deleteContent,
  flag,
  takeDown,
  updateStreak,
  likesAndPosts,
  rating,
  getAllCommunities,
  getCommunityById,
  getCommunityByTag,
  isMember,
  getContentOfACommunity,
  getCommunitiesPartOf,
  getLatestContent,
  getCommunityProfile,
  getUserProfile,
  getLikeAndFlagStatus,
  getBasicCommunityDataFromId,
  getUserContributionCover,
  getContribution,
  getAllTags,
  getLikedPosts,
  getFastFeed,
  getFastNativeFeed,
  post,
  editCommunityProfile,
  getAllContributionOfUser,
  getAllMembers,
  getAllAdmins,
  getAllRelatedSocialGroups,
  getOthersContributionCover,
  getMediaAndDocs,
  gotOffline,
  addToConstraintList,
  removeFromConstraintList,
  getConstraintStatus,
  updateBooleanField,
  addAdmin,
  removeAdmin,
  searchCommunityMembers,
  searchCommunityContent,
  searchCommunityFiles,
  leaveAsAdmin,
  setEntryRules,
  getEntryRules,
  removeMember,
  banUserFromCommunity,
  getBannedUsers,
  removeFromBanList,
  checkCommunityExists,
  createPoll,
  getPoll,
  updateVote,
  searchCommunities,
  getCommunityFieldsById,
  getRandomCommunities,
  fetchCommunityLeaderBoard,
  getAllCommunity,
} = require("../controllers/communityControllers");

router.post("/createCommunity", createCommunity);
router.post("/deleteCommunity", deleteCommunity);
router.post("/joinAsMember", joinAsMember);
router.post("/leaveAsMember", leaveAsMember);
router.post("/deleteContent", deleteContent);
router.post("/flag", flag);
router.post("/takeDown", takeDown);
router.post("/updateStreak", updateStreak);
router.post("/likesAndPosts", likesAndPosts);
router.post("/rating", rating);
router.get("/getAllCommunities", getAllCommunities);
router.get("/getCommunityById", getCommunityById);
router.get("/getCommunityByTag", getCommunityByTag);
router.get("/isMember", isMember);
router.get("/getContentOfACommunity", getContentOfACommunity);
router.get("/getCommunitiesPartOf", getCommunitiesPartOf);
router.get("/getLatestContent", getLatestContent);
router.get("/getCommunityProfile", getCommunityProfile);
router.get("/getUserProfile", getUserProfile);
router.get("/getLikeAndFlagStatus", getLikeAndFlagStatus);
router.get("/getBasicCommunityDataFromId", getBasicCommunityDataFromId);
router.get("/getUserContributionCover", getUserContributionCover);
router.get("/getContribution", getContribution);
router.get("/getAllTags", getAllTags);
router.get("/getLikedPosts", getLikedPosts);
router.get("/getFastFeed", getFastFeed);
router.get("/getFastNativeFeed", getFastNativeFeed);
router.post("/post", post);
router.post("/editCommunityProfile", editCommunityProfile);
router.get("/getAllContributionOfUser", getAllContributionOfUser);
router.get("/getAllMembers", getAllMembers);
router.get("/getAllAdmins", getAllAdmins);
router.get("/getAllRelatedSocialGroups", getAllRelatedSocialGroups);
router.get("/getBatchedContent", getBatchedContent);
router.get("/getOthersContributionCover", getOthersContributionCover);
router.get("/getMediaAndDocs", getMediaAndDocs);
router.get("/gotOffline", gotOffline);
router.post("/addToConstraintList", addToConstraintList);
router.post("/removeFromConstraintList", removeFromConstraintList);
router.get("/getConstraintStatus", getConstraintStatus);
router.post("/updateBooleanField", updateBooleanField);
router.post("/addAdmin", addAdmin);
router.post("/removeAdmin", removeAdmin);
router.get("/searchCommunityMembers", searchCommunityMembers);
router.get("/searchCommunityContent", searchCommunityContent);
router.get("/searchCommunityFiles", searchCommunityFiles);
router.post("/leaveAsAdmin", leaveAsAdmin);
router.patch("/setEntryRules", setEntryRules);
router.get("/getEntryRules", getEntryRules);
router.post("/removeMember", removeMember);
router.post("/banUserFromCommunity", banUserFromCommunity);
router.get("/getBannedUsers", getBannedUsers);
router.post("/removeFromBanList", removeFromBanList);
router.get("/checkCommunityExists", checkCommunityExists);
router.post("/createPoll", createPoll);
router.get("/getPoll/:pollId", getPoll);
router.post("/updateVote", updateVote);
router.get("/searchCommunities", searchCommunities);
router.post("/getCommunityFieldsById", getCommunityFieldsById);
router.get("/getRandomCommunities", getRandomCommunities);
router.get("/fetchCommunityLeaderBoard", fetchCommunityLeaderBoard);
router.post("/getAllCommunity", getAllCommunity);

module.exports = router;
