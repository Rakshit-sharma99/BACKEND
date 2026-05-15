const mongoose = require("mongoose");

const fieldSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "textarea", "image", "date"],
      required: true,
    },
    placeholder: { type: String },
    required: { type: Boolean, default: false },
    order: { type: Number, required: true },
  },
  { _id: false }
);

const awardSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["certificate", "badge"],
      required: true,
    },
    title: { type: String, required: true },
    url: { type: String, required: true },
    guideUrl: { type: String },
    fields: { type: [fieldSchema], default: [] },
    price: { type: Number, required: true },
    oldPrice: { type: Number },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Award", awardSchema);
