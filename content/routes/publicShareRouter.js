const express = require("express");
const router = express.Router();
const { resolveShareGrant } = require("../controllers/shareGrantController");

router.get("/share", resolveShareGrant);

module.exports = router;
