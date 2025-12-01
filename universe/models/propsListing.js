const mongoose = require("mongoose");
const propsListingSchema = new mongoose.Schema({
    name: {
        type: String
    },
    image: {
        type: String
    },
    desc: {
        type: String
    },
    //[{img:"",txt:""}]
    data: {
        type: Array
    },
    hearts: {
        type: Number,
        default: 0
    },
    onField: {
        type: Number,
        default: 1
    },
    color: {
        type: String
    },
    dayPrice: {
        type: Number
    },
    nightPrice: {
        type: Number
    },
    reviews: {
        type: Array
    }
})

module.exports = mongoose.model("PropsListing", propsListingSchema);