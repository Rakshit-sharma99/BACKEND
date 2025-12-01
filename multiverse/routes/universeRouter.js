const express = require("express");
const router = express.Router();
const authenticate = require("../middlewares/authentication");

const { createUniverse, getAllUniverse, getLastUpdated } = require("../controllers/universeControllers");

router.post("/createUniverse",authenticate, createUniverse);
router.get("/getAllUniverse",getAllUniverse);
router.get("/getLastUpdated",getLastUpdated);

module.exports = router;
