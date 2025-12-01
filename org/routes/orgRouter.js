const express = require("express");
const router = express.Router();

const { findOrg, createOrg } = require("../controllers/orgControllers");

router.post("/createOrg",createOrg);
router.post("/findOrg",findOrg)

module.exports = router;