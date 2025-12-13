const express = require("express");
const router = express.Router();

const {
  createOverlay,
  getOverlayById,
  addOverlayToUsers,
  handleOverlayButtonPress,
  addOverlayToTicketBuyers,
  addOverlayToAllUsers,
  removeOverlayFromAllUsers,
} = require("../controllers/overlayControllers");

router.post("/createOverlay", createOverlay);
router.get("/getOverlayById", getOverlayById);
router.post("/addOverlayToUsers", addOverlayToUsers);
router.post("/handleOverlayButtonPress", handleOverlayButtonPress);
router.post("/addOverlayToTicketBuyers", addOverlayToTicketBuyers);
router.post("/addOverlayToAllUsers", addOverlayToAllUsers);
router.post("/removeOverlayFromAllUsers", removeOverlayFromAllUsers);

module.exports = router;
