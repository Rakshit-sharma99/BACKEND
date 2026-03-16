const express = require("express");
const router = express.Router();

const {
  clusterSemanticNodes,
  getAllTerritories,
  getDetailsOfTerritory,
  deleteAllTerritories,
  searchTerritories,
  getNodeTerritoryAndPosition,
  backfillTerritoryUidAndUniverse,
} = require("../controllers/territoryControllers");

const {
  clusterFacetsIntoTerritories,
  assignFacetSpatialCoordinates,
} = require("../controllers/facetClusteringControllers");

router.post("/clusterSemanticNodes", clusterSemanticNodes);
router.get("/getAllTerritories", getAllTerritories);
router.get("/getDetailsOfTerritory", getDetailsOfTerritory);
router.delete("/deleteAllTerritories", deleteAllTerritories);
router.post("/clusterFacetsIntoTerritories", clusterFacetsIntoTerritories);
router.post("/assignFacetSpatialCoordinates", assignFacetSpatialCoordinates);
router.get("/searchTerritories", searchTerritories);
router.get("/getNodeTerritoryAndPosition", getNodeTerritoryAndPosition);
router.post("/backfillTerritoryUidAndUniverse", backfillTerritoryUidAndUniverse);

module.exports = router;
