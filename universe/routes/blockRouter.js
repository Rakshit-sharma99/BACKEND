const express = require("express");
const router = express.Router();

const {
  createBlock,
  editBlock,
  getBlocksForPage,
  getBlockWithSignature,
} = require("../controllers/blocksControllers");

router.post("/createBlock", createBlock);
router.post("/editBlock", editBlock);
router.post("/getBlocksForPage", getBlocksForPage);
router.get("/getBlockWithSignature", getBlockWithSignature);

module.exports = router;
