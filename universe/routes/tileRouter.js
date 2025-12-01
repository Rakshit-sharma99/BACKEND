const express = require("express");
const router = express.Router();

const { createTile, deleteTile, getTiles } = require("../controllers/tileController")

router.post("/createTile", createTile);
router.post("/deleteTile", deleteTile);
router.get("/getTiles", getTiles);

module.exports = router;