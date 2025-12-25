const express = require('express');
const router = express.Router();

const {
  generatePaymentIntent,
  createOrder,
  createAwardsOrder,
} = require('../controllers/paymentControllers');

router.post('/generatePaymentIntent', generatePaymentIntent);
router.post('/createOrder', createOrder);
router.post("/createAwardsOrder", createAwardsOrder);

module.exports = router;
