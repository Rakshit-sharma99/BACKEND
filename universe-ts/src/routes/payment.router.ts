import { Router } from 'express';
import { generatePaymentIntent, createOrder } from '../controllers/payment.controller';

const router: Router = Router();

router.post('/generate-payment-intent', generatePaymentIntent);
router.post('/create-order', createOrder);

export default router;
