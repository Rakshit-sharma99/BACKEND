const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },

    description: {
        type: String
    },

    image: {
        type: String
    },

    // Reward Type (important)
    type: {
        type: String,
        enum: ["physical", "digital"],
        required: true
    },

    // Category (for filtering UI)
    category: {
        type: String,
        enum: [
            "clothing",
            "accessory",
            "stationery",
            "voucher",
            "other"
        ]
    },

    // Points required to redeem
    pointsRequired: {
        type: Number,
        required: true,
        min: 0
    },

    // Stock management
    stock: {
        type: Number,
        default: 0,
        min: 0
    },

    isAvailable: {
        type: Boolean,
        default: false
    },

    // Variants (for T-shirt, Hoodie sizes etc.)
    variants: [
        {
            name: String, // S, M, L, XL OR color
            stock: {
                type: Number,
                default: 0
            }
        }
    ],

    // Voucher specific fields
    voucherDetails: {
        brand: String, // Amazon, Event etc.
        value: {
            type: Number
        },
        type: {
            type: String,
            enum: ["percentage", "flat"]
        }
    },

    // Shipping required ?
    requiresShipping: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Product", productSchema);