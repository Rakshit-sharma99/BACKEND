const express = require('express');
const router = express.Router();

const {
  generateTicket,
  scanTicket,
  reviewEvent,
  likeReview,
  unLikeReview,
  verifyUPIPayment,
  test,
  getTicketsByIds,
  getTicketTypesCount,
  getTicketFieldsById,
  getDetailedTickets,
  getReviewedTickets,
  getRedeemedTickets,
  findEventTicketsBoughtByUser,
} = require('../controllers/ticketControllers');

router.post('/generateTicket', generateTicket);
router.post('/scanTicket', scanTicket);
router.post('/reviewEvent', reviewEvent);
router.get('/likeReview', likeReview);
router.get('/unlikeReview', unLikeReview);
router.post('/verifyUPIPayment', verifyUPIPayment);
router.get('/test', test);
router.post('/getTicketsByIds', getTicketsByIds);
router.post('/getTicketTypesCount', getTicketTypesCount);
router.post('/getTicketFieldsById', getTicketFieldsById);
router.post('/getDetailedTickets', getDetailedTickets);
router.get('/getReviewedTickets', getReviewedTickets);
router.get('/getRedeemedTickets', getRedeemedTickets);
router.get('/findEventTicketsBoughtByUser', findEventTicketsBoughtByUser);

module.exports = router;
