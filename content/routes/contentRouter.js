const express = require("express");
const router = express.Router();

const {
  createContent,
  likeContent,
  comment,
  unlikeContent,
  getContent,
  getComments,
  getPopularComments,
  likeAComment,
  unLikeAComment,
  getRandomContent,
  editContent,
  searchContentByTag,
  loadMoreContent,
  replyToComment,
  searchContent,
  searchByCommunity,
  generateHashTags,
  getEngagementData,
  searchContentByText,
  getContentForLanding,
  getMultipleContents,
  searchContentFromIds,
  migrateCollectionController,
  uploadToS3,
  uploadMiddleware,
} = require("../controllers/contentController");

router.post("/createContent", createContent);
router.post("/likeContent", likeContent);
router.post("/comment", comment);
router.post("/unlikeContent", unlikeContent);
router.get("/getContent", getContent);
router.get("/getComments", getComments);
router.get("/getPopularComments", getPopularComments);
router.get("/likeAComment", likeAComment);
router.get("/unLikeAComment", unLikeAComment);
router.get("/getRandomContent", getRandomContent);
router.patch("/editContent", editContent);
router.get("/searchContentByTag", searchContentByTag);
router.get("/loadMoreContent", loadMoreContent);
router.post("/replyToComment", replyToComment);
router.get("/searchContent", searchContent);
router.post("/searchByCommunity", searchByCommunity);
router.post("/generateHashTags", generateHashTags);
router.post("/getEngagementData", getEngagementData);
router.get("/searchContentByText", searchContentByText);
router.get("/getContentForLanding", getContentForLanding);
router.post("/getMultipleContents", getMultipleContents);
router.post("/searchContentFromIds", searchContentFromIds);
router.post("/migrateCollectionController", migrateCollectionController);
router.post("/uploadToS3",uploadMiddleware, uploadToS3);
module.exports = router;
