const express = require("express");
const router = express.Router();

const {
  clusterSemanticNodes,
  getAllTerritories,
  getDetailsOfTerritory,
  deleteAllTerritories,
} = require("../controllers/territoryControllers");

router.post("/clusterSemanticNodes", clusterSemanticNodes);
router.get("/getAllTerritories", getAllTerritories);
router.get("/getDetailsOfTerritory", getDetailsOfTerritory);
router.delete("/deleteAllTerritories", deleteAllTerritories);

module.exports = router;