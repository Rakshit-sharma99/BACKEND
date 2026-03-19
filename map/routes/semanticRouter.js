const express = require("express");
const router = express.Router();

const {
  createNodesForClubs,
  createNodesForCommunities,
  embedAllNodes,
  club_z_scale,
  community_z_scale,
  getSampleSemanticNodes,
  getSemanticNodesForViewport,
  getSemanticNodeBounds,
  assignLocalSpatialCoordinates,
  getNodesForTerritory,
  deleteNodesByEntityType,
  getSemanticNodeCounts,
  backfillSemanticNodeUid,
} = require("../controllers/semanticNodeControllers");

const {
  createProfileFacetNodes,
  refreshProfileFacetNodes,
  vectorSearchProfileFacets,
  metaSearchProfileFacets,
  getUserFacetTexts,
} = require("../controllers/semanticNodeControllers2");

router.post("/createNodesForClubs", createNodesForClubs);
router.post("/createNodesForCommunities", createNodesForCommunities);
router.post("/embedAllNodes", embedAllNodes);
router.post("/club_z_scale", club_z_scale);
router.post("/community_z_scale", community_z_scale);
router.get("/getSampleSemanticNodes", getSampleSemanticNodes);
router.post("/getSemanticNodesForViewport", getSemanticNodesForViewport);
router.get("/getSemanticNodeBounds", getSemanticNodeBounds);
router.post("/assignLocalSpatialCoordinates", assignLocalSpatialCoordinates);
router.get("/getNodesForTerritory", getNodesForTerritory);
router.delete("/deleteNodesByEntityType", deleteNodesByEntityType);
router.get("/getSemanticNodeCounts", getSemanticNodeCounts);
router.post("/backfillSemanticNodeUid", backfillSemanticNodeUid);

// Profile Facet Routes
router.post("/createProfileFacetNodes", createProfileFacetNodes);
router.post("/refreshProfileFacetNodes", refreshProfileFacetNodes);
router.post("/vectorSearchProfileFacets", vectorSearchProfileFacets);
router.post("/metaSearchProfileFacets", metaSearchProfileFacets);
router.get("/getUserFacetTexts", getUserFacetTexts);

module.exports = router;
