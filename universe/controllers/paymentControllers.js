const { StatusCodes } = require('http-status-codes');
const Razorpay = require('razorpay');

//for stripe
const generatePaymentIntent = async (req, res) => {
  try {
    res.status(StatusCodes.OK).send('Stripe was decommisioned');
  } catch (e) {
    res.status(StatusCodes.OK).json({ error: e.message });
  }
};

//for upi
const createOrder = async (req, res) => {
  const { RAZOR_PAY_KEY, RAZOR_PAY_SECRET } = process.env;
  const razorpayInstance = new Razorpay({
    key_id: RAZOR_PAY_KEY,
    key_secret: RAZOR_PAY_SECRET,
  });
  try {
    const { amount, productName, description } = req.body;
    const options = {
      amount: amount * 100,
      currency: 'INR',
      receipt: 'razorUser@gmail.com',
    };
    razorpayInstance.orders.create(options, (err, order) => {
      if (!err) {
        res.status(200).send({
          success: true,
          msg: 'Order Created',
          order_id: order.id,
          amount: amount,
          product_name: productName,
          description: description,
        });
      } else {
        res.status(400).send({ success: false, msg: 'Something went wrong!' });
      }
    });
  } catch (error) {
    console.log(error.message);
  }
};

module.exports = { generatePaymentIntent, createOrder };
