const express = require("express");
const router = express.Router();

const {
  clusterSemanticNodes,
  getAllTerritories,
  getDetailsOfTerritory,
} = require("../controllers/territoryControllers");

router.post("/clusterSemanticNodes", clusterSemanticNodes);
router.get("/getAllTerritories", getAllTerritories);
router.get("/getDetailsOfTerritory", getDetailsOfTerritory);

module.exports = router;