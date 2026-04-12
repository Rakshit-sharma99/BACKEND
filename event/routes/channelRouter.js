const { Router } = require("express");
const {
  createChannel,
  addMember,
  getChannels,
  addAllTicketBuyers,
  savePermissions,
} = require("../controllers/channelControllers");
const router = Router();

router.post("/createChannel", createChannel);
router.post("/addMember", addMember);
router.get("/getChannels", getChannels);
router.post("/addAllTicketBuyers", addAllTicketBuyers);
router.post("/savePermissions", savePermissions);

module.exports = router;
