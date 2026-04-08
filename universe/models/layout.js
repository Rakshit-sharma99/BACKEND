const mongoose = require("mongoose");

const rowSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    seats: { type: Number, required: true },
    ticketType: { type: String },
    gapAfterSeats: [Number],
  },
  { _id: false },
);

const levelSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    rows: [rowSchema],
    gapAfterRows: [Number],
  },
  { _id: false },
);

const blockSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },
    name: { type: String, required: true },
    rows: [rowSchema],
    gapAfterRows: [Number],
  },
  { _id: false },
);

const layoutSchema = new mongoose.Schema(
  {
    name: String,
    type: {
      type: String,
      enum: [
        "auditorium",
        "theatre",
        "cricketStadium",
        "footballStadium",
        "hockeyStadium",
      ],
    },
    levels: [levelSchema],
    blocks: [blockSchema],
    location: {
      lat: Number,
      lng: Number,
    },
    uid: String,
    ticketTypeColors: {
      type: Map,
      of: String,
    },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Layout", layoutSchema);
