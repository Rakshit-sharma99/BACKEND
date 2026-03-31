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

const {
  getChannels,
  getSelectedChannels,
  selectChannels,
  purgeChannel,
} = require("../controllers/whatsapp/channelController");

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

// ── Channel (Newsletter) Management ──
router.get("/channels", getChannels);
router.get("/channels/selected", getSelectedChannels);
router.post("/channels/select", selectChannels);
router.post("/channels/:id/purge", purgeChannel);

module.exports = router;
