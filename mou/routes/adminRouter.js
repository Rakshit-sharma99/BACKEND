const express = require("express");
const router = express.Router();

const {
  getPendingMOUs,
  setMOUParameters,
  sendMOU,
  voidMOU,
  createMOUDraft
} = require("../controllers/adminControllers");

// Admin routes (should have an admin auth middleware check eventually)
router.get("/pending", getPendingMOUs);
router.patch("/:mouId/parameters", setMOUParameters);
router.post("/:mouId/send", sendMOU);
router.post("/:mouId/void", voidMOU);

// Internal routes
router.post("/internal/draft", createMOUDraft);

module.exports = router;
