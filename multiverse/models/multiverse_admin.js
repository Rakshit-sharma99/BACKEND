const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");

const adminSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please provide the admin name."],
  },
  position: {
    type: String,
    required: [true, "Please provide the admin position."],
  },
  email: {
    type: String,
    required: [true, "Please provide the email id of the admin."],
    match: [
      /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      "Please provide a valid email",
    ],
    unique: true,
  },
  password: {
    type: String,
    required: [true, "Please provide the password of the admin."],
  },
  image: {
    type: String,
    default: "xyz.com",
  },
  adminKey: {
    type: String,
  },
  pushToken: {
    type: String,
  },
});

adminSchema.methods.createAccessToken = function () {
  return jwt.sign(
    { role: "admin", id: this._id },
    process.env.ACCESS_TOKEN_SECRET,
    {
      expiresIn: 60 * 25,
    }
  );
};

adminSchema.methods.createRefreshToken = function () {
  return jwt.sign(
    { role: "admin", id: this._id },
    process.env.REFRESH_TOKEN_SECRET,
    {
      expiresIn: 60 * 60 * 24 * 30,
    }
  );
};

module.exports = mongoose.model("Admin", adminSchema);
