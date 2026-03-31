const express = require("express");
const router = express.Router();

const {
  getStatus,
  getQR,
  connect,
  logout,
} = require("../controllers/whatsapp/connectionController");

const {
  getCommunities,
  getSelectedCommunities,
  selectCommunities,
  purgeCommunity,
} = require("../controllers/whatsapp/communityController");

// ── Connection Management ──
router.get("/status", getStatus);
router.get("/qr", getQR);
router.post("/connect", connect);
router.post("/logout", logout);

// ── Community Management ──
router.get("/communities", getCommunities);
router.get("/communities/selected", getSelectedCommunities);
router.post("/communities/select", selectCommunities);
router.post("/communities/:id/purge", purgeCommunity);

module.exports = router;
