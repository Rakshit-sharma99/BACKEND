const express = require("express");
const router = express.Router();

const { getUnsortedWords } = require("../controllers/unsortedControllers");

router.get("/getUnsortedWords", getUnsortedWords);

module.exports = router;