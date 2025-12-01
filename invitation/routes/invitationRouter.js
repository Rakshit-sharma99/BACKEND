const express = require("express");
const router = express.Router();

const { insertNewFields, createInvitation, getInvitationInfo, declineInvitation, endorseInvitation, acceptInvitation, getPendingCreatorApplications, fetchAllClubProposals, getInvitationById } = require("../controllers/invitationController");

router.post("/createInvitation", createInvitation);
router.get("/getInvitationInfo", getInvitationInfo);
router.get("/declineInvitation", declineInvitation);
router.post("/endorseInvitation", endorseInvitation);
router.get("/acceptInvitation", acceptInvitation);
router.get("/getPendingCreatorApplications", getPendingCreatorApplications);
router.get("/fetchAllClubProposals", fetchAllClubProposals);
router.post("/insertNewFields",insertNewFields),
router.post("/getInvitationById",getInvitationById)

module.exports = router;
