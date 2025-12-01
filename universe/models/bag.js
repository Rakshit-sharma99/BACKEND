const mongoose = require("mongoose");
const bagSchema = new mongoose.Schema({
    keyWords: {
        type: Array
    },
    title: {
        type: String
    }
});

module.exports = mongoose.model("Bag", bagSchema)