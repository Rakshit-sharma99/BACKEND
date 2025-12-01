const express = require("express");
const router = express.Router();

const {
  createJoinLink,
  getJoinLinkData,
} = require("../controllers/joinLinkControllers");

router.post("/createJoinLink", createJoinLink);
router.get("/getJoinLinkData", getJoinLinkData);

module.exports = router;
