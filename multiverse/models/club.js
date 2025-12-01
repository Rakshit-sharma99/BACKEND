const mongoose = require("mongoose");
const clubSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please provide the name of the club."],
  },
  motto: {
    type: String,
    required: [true, "Please provide the motto of the club."],
  },
  tags: {
    type: Array,
  },
  featuringImg: {
    type: String,
    required: [true, "Please provide the motto of the club."],
  },
  secondaryImg: {
    type: String,
  },
  createdOn: {
    type: Date,
    default: new Date(),
  },
  hiddenTags: {
    type: Array,
  },
});

module.exports = mongoose.model("Club", clubSchema);
