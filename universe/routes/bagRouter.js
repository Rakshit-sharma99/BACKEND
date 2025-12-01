const express = require('express');
const router = express.Router();

const { createBag, search, getAllKeywords, unsortedTag, getUnsortedTags, sortATag, getKeysFromBag, deleteKeyFromBag, deleteABag, deleteUnsortedWord, masterSearch } = require("../controllers/bagControllers");

router.post("/createBag", createBag);
router.post("/search", search);
router.get("/getAllKeywords", getAllKeywords);
router.post("/unsortedTag", unsortedTag);
router.get("/getUnsortedTags", getUnsortedTags);
router.post("/sortATag", sortATag);
router.post("/getKeysFromBag", getKeysFromBag);
router.post("/deleteKeyFromBag", deleteKeyFromBag);
router.post("/deleteABag", deleteABag);
router.post("/deleteUnsortedWord", deleteUnsortedWord);
router.get("/masterSearch", masterSearch);

module.exports = router;
