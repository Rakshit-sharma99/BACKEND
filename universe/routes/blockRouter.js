const express = require("express");
const router = express.Router();

const {
  createBlock,
  editBlock,
  getBlocksForPage,
} = require("../controllers/blocksControllers");

router.post("/createBlock", createBlock);
router.post("/editBlock", editBlock);
router.get("/getBlocksForPage", getBlocksForPage);

module.exports = router;
