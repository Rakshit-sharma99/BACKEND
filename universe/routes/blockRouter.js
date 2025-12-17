const express = require("express");
const router = express.Router();

const {
  createBlock,
  editBlock,
  getBlocksForPage,
} = require("../controllers/blocksControllers");

router.post("/createBlock", createBlock);
router.post("/editBlock", editBlock);
router.post("/getBlocksForPage", getBlocksForPage);

module.exports = router;
