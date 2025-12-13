const express = require("express");
const router = express.Router();

const { insertNewFields, createContent, likeContent, comment, unlikeContent, deleteContent, getComments, getContent, getContentBySpan, getLikeStatus, getMacbeaseContribution, getPopularComments, likeAComment, unLikeAComment, getBatchedContent, getDateWiseContent, tagSearchContent, editContent, replyToComment, searchContentByText, getContentFromLastTimeStamp, getMacbeaseContentByIds, getMacbeaseContentByField } = require("../controllers/macbeaseContentControllers");

router.post("/createContent", createContent);
router.post("/likeContent", likeContent);
router.post("/comment", comment);
router.post("/unlikeContent", unlikeContent);
router.post("/deleteContent", deleteContent);
router.get("/getContent", getContent);
router.get("/getComments", getComments);
router.get("/getContentBySpan", getContentBySpan);
router.get("/getLikeStatus", getLikeStatus);
router.get("/getMacbeaseContribution", getMacbeaseContribution);
router.get("/getPopularComments", getPopularComments);
router.get("/likeAComment", likeAComment);
router.get("/unLikeAComment", unLikeAComment);
router.get("/getBatchedContent", getBatchedContent);
router.get("/getDateWiseContent", getDateWiseContent);
router.get("/tagSearchContent", tagSearchContent);
router.patch("/editContent", editContent);
router.post("/replyToComment", replyToComment);
router.get("/searchContentByText", searchContentByText);
router.get("/getContentFromLastTimeStamp", getContentFromLastTimeStamp);
router.post("/getMacbeaseContentByIds", getMacbeaseContentByIds);
router.post("/insertNewFields",insertNewFields);
router.post("/getMacbeaseContentByField",getMacbeaseContentByField);

module.exports = router;
