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
} = require("../controllers/semanticNodeControllers");

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

module.exports = router;