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
} = require("../controllers/universeControllers");

router.post("/createUniverse", authenticate, createUniverse);
router.post("/editUniverse", authenticate, editUniverse);
router.get("/getAllUniverses", getAllUniverses);
router.get("/searchUniverse", searchUniverse);
router.get("/getPopularUniverses", getPopularUniverses);
router.get("/getAllowedDomains", authenticate, getAllowedDomains);
router.get("/getEnrichedUniverseData", getEnrichedUniverseData);

module.exports = router;
