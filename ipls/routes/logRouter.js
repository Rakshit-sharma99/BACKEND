const express = require("express");
const router = express.Router();

const { createLog } = require("../controllers/logControllers");

router.post("/createLog", createLog);

module.exports = router;
