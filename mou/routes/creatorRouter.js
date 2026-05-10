const express = require("express");
const router = express.Router();

const {
  getMOUByEventId,
  generateSigningUrl,
  downloadMOUDocument,
  getClubMOUs,
  markCreatorSigned
} = require("../controllers/creatorControllers");

router.get("/event/:eventId", getMOUByEventId);
router.post("/:mouId/signing-url", generateSigningUrl);
router.post("/:mouId/creator-signed", markCreatorSigned);
router.get("/:mouId/document", downloadMOUDocument);
router.get("/club/:clubId/mous", getClubMOUs);

module.exports = router;
