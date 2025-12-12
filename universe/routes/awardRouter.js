const express = require("express");
const router = express.Router();

const {
  createAward,
  updateAward,
  getAllAwards,
  generateCertificatePreview,
  dispatchCertificates,
} = require("../controllers/awardControllers");

router.post("/createAward", createAward);
router.patch("/updateAward", updateAward);
router.get("/getAllAwards", getAllAwards);
router.post("/generateCertificatePreview", generateCertificatePreview);
router.post("/dispatchCertificates", dispatchCertificates);

module.exports = router;
