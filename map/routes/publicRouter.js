const express = require("express");
const router = express.Router();

const {
  getAllTerritories,
  getDetailsOfTerritory,
  searchTerritories,
} = require("../controllers/territoryControllers");

router.get("/getAllTerritories", getAllTerritories);
router.get("/getDetailsOfTerritory", getDetailsOfTerritory);
router.get("/searchTerritories", searchTerritories);

module.exports = router;
