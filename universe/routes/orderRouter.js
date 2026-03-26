const express = require("express");
const { createOrder, getOrders } = require("../controllers/orderControllers");
const router = express.Router();

router.post("/createOrder", createOrder);
router.get("/getOrders", getOrders);

module.exports = router;