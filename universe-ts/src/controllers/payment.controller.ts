import { StatusCodes } from 'http-status-codes';
import { Request, Response } from 'express';
import Razorpay from 'razorpay';

/**
 * @desc Generate payment intent for Stripe (Decommissioned)
 * @route POST /payment/generate-payment-intent
 * @access Public
 */
const generatePaymentIntent = async (req: Request, res: Response) => {
  try {
    return res.status(StatusCodes.GONE).json({
      message: 'Stripe payment processing has been decommissioned.',
    });
  } catch (error) {
    console.error('Error in generatePaymentIntent:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while processing the payment request.',
    });
  }
};

/**
 * @desc Create a new order via Razorpay
 * @route POST /payment/create-order
 * @access Public
 */
const createOrder = async (req: Request, res: Response) => {
  try {
    const { RAZOR_PAY_KEY, RAZOR_PAY_SECRET } = process.env;
    if (!RAZOR_PAY_KEY || !RAZOR_PAY_SECRET) {
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        message: 'Razorpay credentials are missing in environment variables.',
      });
    }

    const { amount, productName, description } = req.body;
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        message: 'Invalid amount specified.',
      });
    }

    const razorpayInstance = new Razorpay({
      key_id: RAZOR_PAY_KEY,
      key_secret: RAZOR_PAY_SECRET,
    });

    const options = {
      amount: amount * 100, // Convert to paise
      currency: 'INR',
      receipt: `receipt_${Date.now()}`,
    };

    await razorpayInstance.orders.create(options, (err, order) => {
      if (!err) {
        res.status(StatusCodes.OK).json({
          success: true,
          msg: 'Order Created',
          order_id: order.id,
          amount: amount,
          product_name: productName,
          description: description,
        });
      } else {
        res.status(StatusCodes.OK).json({ success: false, msg: 'Something went wrong!' });
      }
    });
  } catch (error) {
    console.error('Error in createOrder:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      message: 'An error occurred while creating the order.',
    });
  }
};

export { generatePaymentIntent, createOrder };
