const crypto = require("crypto");
const ticketQueue = require("../queues/ticketQueue");

const razorpay_web_hook = async (req, res) => {
  try {
    console.log("hook called");
    const secret = process.env.RAZOR_PAY_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    const body = JSON.stringify(req.body);

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(body)
      .digest("hex");

    if (signature !== expectedSignature) {
      console.log("signature not verified")
      return res.status(400).send("Invalid signature");
    }

    const event = req.body.event;
    console.log("event",event);

    if (event === "payment.captured") {
      const payment = req.body.payload.payment.entity;

      // Immediately respond to Razorpay
      res.status(200).send("OK");

      // Continue processing asynchronously after responding
      if (payment?.notes?.awardId) {
        console.log("award hook controller");
        return;
      }

      await ticketQueue.add(
        "processTicket",
        { payment },
        {
          delay: 15000,
          jobId: `ticket_${payment.id}`, // idempotency safeguard
          attempts: 5,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: 500,
          removeOnFail: 1000,
          timeout: 60000,
          lifo: false,
          priority: 5,
        }
      );
      console.log("ticket queued");
      return; // ensure nothing else sends a response
    }

    // For other webhook events:
    return res.status(200).send("OK");
  } catch (err) {
    console.error("Webhook error:", err);
    return res.status(500).send("Internal server error");
  }
};

module.exports = { razorpay_web_hook };
