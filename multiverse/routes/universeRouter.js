const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authentication");

const {
  createUniverse,
  editUniverse,
  getAllUniverses,
  searchUniverse,
  getPopularUniverses,
  getAllowedDomains,
  getEnrichedUniverseData,
  getUniverseByCallSign,
  getUniversesByIds,
} = require("../controllers/universeControllers");

const {
  createCustomUniverse,
  getAllCustomUniverses,
} = require("../controllers/customUniverseControllers");

router.post("/createUniverse", authenticate, createUniverse);
router.post("/createCustomUniverse", createCustomUniverse);
router.get("/getAllCustomUniverses", authenticate, getAllCustomUniverses);
router.post("/editUniverse", authenticate, editUniverse);
router.get("/getAllUniverses", getAllUniverses);
router.get("/searchUniverse", searchUniverse);
router.get("/getPopularUniverses", getPopularUniverses);
router.get("/getAllowedDomains", authenticate, getAllowedDomains);
router.get("/getEnrichedUniverseData", getEnrichedUniverseData);
router.get("/getUniverseByCallSign", getUniverseByCallSign);
router.post("/getUniversesByIds", getUniversesByIds);
module.exports = router;
