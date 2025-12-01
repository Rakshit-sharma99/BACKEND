const mongoose = require("mongoose");
const tileSchema = new mongoose.Schema({
    name: {
        type: String
    },
    image: {
        type: String
    }
})

module.exports = mongoose.model("Tile", tileSchema);

