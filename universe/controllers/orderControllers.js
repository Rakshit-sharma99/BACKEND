const Order = require("../models/order")
const ChapterLeader = require("../models/chapterLeader")
const Product = require("../models/product")
const { StatusCodes } = require("http-status-codes");
const mongoose = require("mongoose");
const { sendMail } = require("../controllers/utils");

const createOrder = async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { productId, quantity, addressId } = req.body;
        const leaderId = req.user.id;

        const leader = await ChapterLeader.findById(leaderId).session(session);
        if (!leader) {
            await session.abortTransaction();
            session.endSession();
            return res.status(StatusCodes.NOT_FOUND).json({
                success: false,
                message: "Leader not found"
            });
        }

        const product = await Product.findById(productId).session(session);
        if (!product) {
            await session.abortTransaction();
            session.endSession();
            return res.status(StatusCodes.NOT_FOUND).json({
                success: false,
                message: "Product not found"
            });
        }

        if (!product.isAvailable || product.stock === 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "Product is not available"
            });
        }

        if (product.requiresShipping) {
            if (!addressId) {
                await session.abortTransaction();
                session.endSession();
                return res.status(StatusCodes.BAD_REQUEST).json({
                    success: false,
                    message: "Address is required for this product"
                });
            }
            console.log(leader.addresses)
            console.log(addressId)
            const address = leader.addresses.find((address) => address._id.toString() === addressId);
            if (!address) {
                await session.abortTransaction();
                session.endSession();
                return res.status(StatusCodes.NOT_FOUND).json({
                    success: false,
                    message: "Address not found"
                });
            }
        }

        if (!quantity || quantity <= 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "Quantity must be greater than 0"
            });
        }

        if (quantity > product.stock) {
            await session.abortTransaction();
            session.endSession();
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "Insufficient stock"
            });
        }

        const totalCost = quantity * product.pointsRequired;
        if (totalCost > leader.totalIpEarned) {
            await session.abortTransaction();
            session.endSession();
            return res.status(StatusCodes.BAD_REQUEST).json({
                success: false,
                message: "Insufficient IP points"
            });
        }

        const order = new Order({
            chapterLeaderId: leaderId,
            productId,
            quantity,
            addressId,
            ip: totalCost,
            ...(product.requiresShipping ? { status: "pending" } : { status: "delivered" }),
        });
        await order.save({ session });

        leader.totalIpEarned -= totalCost;
        await leader.save({ session });

        product.stock -= quantity;
        await product.save({ session });

        await session.commitTransaction();
        session.endSession();

        try {
            const isDigital = product.type === "digital";

            const intro = isDigital
                ? [
                    `Hi ${leader.name},`,
                    ``,
                    `<strong>Your reward is ready!</strong>`,
                    `You've successfully redeemed <strong>${totalCost} IP points</strong> for <strong>${quantity} × ${product.name}</strong>.`,
                    ``,
                    ...(product.voucherDetails
                        ? [
                            `<strong>Voucher Details</strong>`,
                            `<strong>${product.name || "N/A"}</strong>`,
                            `${product.voucherDetails.type === "percentage"
                                ? `${product.voucherDetails.value}% off`
                                : `₹${product.voucherDetails.value} flat`
                            }`,
                            ``,
                            `You can use this voucher for the Macbease Events`,
                        ]
                        : []),
                ]
                : [
                    `Hi ${leader.name},`,
                    ``,
                    `<strong>Order Confirmed!</strong>`,
                    `<strong>${quantity} × ${product.name}</strong>.`,
                    ``,
                    `<strong>Shipping Update</strong>`,
                    `Our team is preparing your order for shipment. You'll receive tracking details as soon as it's on the way.`,
                ];

            const outro = isDigital
                ? [
                    ``,
                    `Thanks for being an amazing Chapter Leader! 💙`,
                    `Keep earning and redeeming your IP points for exciting rewards.`,
                ]
                : [
                    ``,
                    `If you have any questions, feel free to reach out to us at <a href="mailto:support@macbease.com">support@macbease.com</a>.`,
                    ``,
                    `Thanks for being an amazing Chapter Leader! 💙`,
                ];

            const subject = isDigital
                ? `Your Reward – ${product.name}`
                : `Order Confirmed – ${product.name}`;

            const { ses, params } = await sendMail(
                leader.name,
                intro,
                outro,
                subject,
                [leader.email],
                null
            );

            ses.sendEmail(params, (err) => {
                if (err) console.error("[createOrder] SES sendEmail error:", err);
                else console.log(`[createOrder] Order confirmation email sent to ${leader.email}`);
            });
        } catch (mailErr) {
            console.error("[createOrder] Failed to send confirmation email:", mailErr);
        }

        return res.status(StatusCodes.CREATED).json({
            success: true,
            message: "Product ordered successfully",
            order,
        });
    } catch (err) {
        await session.abortTransaction();
        session.endSession();
        console.error("createOrder error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: "Something went wrong"
        });
    }
}

const getOrders = async (req, res) => {
    try {
        const leaderId = req.user.id;
        if (!leaderId) {
            return res.status(StatusCodes.UNAUTHORIZED).json({
                success: false,
                message: "No leader found"
            });
        }
        const orders = await Order.find({ chapterLeaderId: leaderId }).populate("productId");

        return res.status(StatusCodes.OK).json({
            success: true,
            orders
        });
    } catch (err) {
        console.error("getOrders error:", err);
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, message: "Something went wrong" });
    }
}
module.exports = {
    createOrder,
    getOrders
}