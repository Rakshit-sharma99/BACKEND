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
        enum: ["physical", "voucher"],
        required: true
    },

    // Category (for filtering UI)
    category: {
        type: String,
        enum: [
            "clothing",
            "accessory",
            "stationery",
            "voucher"
        ]
    },

    // Points required to redeem
    pointsRequired: {
        type: Number,
        required: true
    },

    // Stock management
    stock: {
        type: Number,
        default: 0
    },

    isAvailable: {
        type: Boolean,
        default: true
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
        code: String,
        expiryDate: Date,
        brand: String // Amazon, Event etc.
    },

    // Shipping required ?
    requiresShipping: {
        type: Boolean,
        default: false
    },

    // Soft delete
    isDeleted: {
        type: Boolean,
        default: false
    }

}, {
    timestamps: true
});

module.exports = mongoose.model("Product", productSchema);