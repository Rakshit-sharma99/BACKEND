const express = require("express");
const router = express.Router();

const { insertNewFields, createJoinLink, getJoinLinkData, getJoinLinkById } = require("../controllers/joinLinkControllers");

router.post("/createJoinLink", createJoinLink);
router.get("/getJoinLinkData", getJoinLinkData);
router.post("/insertNewFields",insertNewFields);
router.post("/getJoinLinkById",getJoinLinkById)

module.exports = router;
