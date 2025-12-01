const express = require("express");
const router = express.Router();

const {
  createContent,
  likeContent,
  comment,
  unlikeContent,
  deleteComment,
  deleteContent,
  getContent,
  getComments,
  getContentBySpan,
  getContentForLanding,
  getRandomContent,
  getMacbContent,
  searchContentByTag,
  likeAComment,
  unLikeAComment,
  getPopularComments,
  redundancy,
  editContent,
  replyToComment,
  loadMoreContent,
  contentEmbedding,
  searchContent,
  searchByCommunity,
  generateHashTags,
  getEngagementData,
  searchContentByText,
} = require("../controllers/contentController");

router.post("/createContent", createContent);
router.post("/deleteContent", deleteContent);
router.post("/likeContent", likeContent);
router.post("/comment", comment);
router.post("/unlikeContent", unlikeContent);
router.post("/deleteComment", deleteComment);
router.get("/getContent", getContent);
router.get("/getComments", getComments);
router.get("/getContentBySpan", getContentBySpan);
router.get("/getContentForLanding", getContentForLanding);
router.get("/getRandomContent", getRandomContent);
router.get("/getMacbContent", getMacbContent);
router.get("/searchContentByTag", searchContentByTag);
router.get("/likeAComment", likeAComment);
router.get("/unLikeAComment", unLikeAComment);
router.get("/getPopularComments", getPopularComments);
router.get("/redundancy", redundancy);
router.patch("/editContent", editContent);
router.post("/replyToComment", replyToComment);
router.get("/loadMoreContent", loadMoreContent);
router.post("/createContentEmbedding", contentEmbedding);
router.get("/searchContent", searchContent);
router.post("/searchByCommunity", searchByCommunity);
router.post("/generateHashTags", generateHashTags);
router.post("/getEngagementData", getEngagementData);
router.get("/searchContentByText", searchContentByText);
module.exports = router;
