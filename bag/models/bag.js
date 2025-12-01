const mongoose = require("mongoose");
const bagSchema = new mongoose.Schema({
    keyWords: {
        type: Array
    },
    title: {
        type: String
    },
    uid: {
    type: String,
  },
  universeMetaData: {
    name: String,
    location: String,
    logo: String,
    callSign: String,
  }
});

module.exports = mongoose.model("Bag", bagSchema)