const mongoose = require("mongoose");

const OrderSchema = new mongoose.Schema(
    {
        chapterLeaderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ChapterLeader"
        },
        productId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product"
        },
        quantity: {
            type: Number,
            required: true
        },
        ip: {
            type: Number,
            required: true
        },
        status: {
            type: String,
            enum: ["pending", "shipped", "delivered", "cancelled"],
            default: "pending"
        },
        addressId: {
            type: String,
        },
        variantId: {
            type: String,
        }
    }
)

module.exports = mongoose.model("Order", OrderSchema);
