const express = require('express');
const router = express.Router();

const {
  generatePaymentIntent,
  createOrder,
} = require('../controllers/paymentControllers');

router.post('/generatePaymentIntent', generatePaymentIntent);
router.post('/createOrder', createOrder);

module.exports = router;
