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
  insertNewFields,
} = require("../controllers/overlayControllers");

router.post("/createOverlay", createOverlay);
router.get("/getOverlayById", getOverlayById);
router.post("/addOverlayToUsers", addOverlayToUsers);
router.post("/handleOverlayButtonPress", handleOverlayButtonPress);
router.post("/addOverlayToTicketBuyers", addOverlayToTicketBuyers);
router.post("/addOverlayToAllUsers", addOverlayToAllUsers);
router.post("/removeOverlayFromAllUsers", removeOverlayFromAllUsers);
router.post("/insertNewFields", insertNewFields);

module.exports = router;
