const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authentication");

const {
  createUniverse,
  editUniverse,
  getAllUniverses,
} = require("../controllers/universeControllers");

router.post("/createUniverse", authenticate, createUniverse);
router.post("/editUniverse", editUniverse);
router.get("/getAllUniverses", getAllUniverses);

module.exports = router;
