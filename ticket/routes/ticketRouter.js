const express = require("express");
const router = express.Router();

const {
  generateTicket,
  scanTicket,
  reviewEvent,
  likeReview,
  unLikeReview,
  verifyUPIPayment,
  getTicketsByIds,
  getTicketTypesCount,
  getTicketFieldsById,
  getDetailedTickets,
  getReviewedTickets,
  getRedeemedTickets,
  findEventTicketsBoughtByUser,
  getTicketFieldsByQuery,
  checkPointScan,
  checkIncompleteTickets,
  fetchPaymentDetails,
  searchMyTickets,
  addMetaDataToTickets,
  getMultipleTicketFieldsByIds,
  searchTickets,
  getPhysicalCopyOfTicket,
  getTicketsByEventIDsAndUID
} = require("../controllers/ticketControllers");

router.post("/generateTicket", generateTicket);
router.post("/scanTicket", scanTicket);
router.post("/reviewEvent", reviewEvent);
router.get("/likeReview", likeReview);
router.get("/unlikeReview", unLikeReview);
router.post("/verifyUPIPayment", verifyUPIPayment);
router.post("/getTicketsByIds", getTicketsByIds);
router.post("/getTicketTypesCount", getTicketTypesCount);
router.post("/getTicketFieldsById", getTicketFieldsById);
router.post("/getDetailedTickets", getDetailedTickets);
router.get("/getReviewedTickets", getReviewedTickets);
router.get("/getRedeemedTickets", getRedeemedTickets);
router.get("/findEventTicketsBoughtByUser", findEventTicketsBoughtByUser);
router.post("/getTicketFieldsByQuery", getTicketFieldsByQuery);
router.post("/checkPointScan", checkPointScan);
router.get("/checkIncompleteTickets", checkIncompleteTickets);
router.get("/fetchPaymentDetails", fetchPaymentDetails);
router.get("/searchMyTickets", searchMyTickets);
router.post("/addMetaDataToTickets", addMetaDataToTickets);
router.post("/getMultipleTicketFieldsByIds",getMultipleTicketFieldsByIds)
router.get("/searchTickets",searchTickets)
router.get("/getPhysicalCopyOfTicket", getPhysicalCopyOfTicket);
router.post("/getTicketsByEventIDsAndUID", getTicketsByEventIDsAndUID);
module.exports = router;
