const { StatusCodes } = require("http-status-codes");
const Multiverse_Admin = require("../models/multiverse_admin");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();

//Refer to Multiverse_Admin Authorization Documentation

const securePassword = async (password) => {
  try {
    const hash = await bcrypt.hash(password, 10);
    return hash;
  } catch (error) {
    console.log(error);
  }
};

//Controller 1
const registerAdmin = async (req, res) => {
  const { name, adminKey, email, password, position } = req.body;
  const existingAdmin = await Multiverse_Admin.findOne({
    name,
    adminKey,
    email,
  });
  if (existingAdmin) {
    return res
      .status(StatusCodes.OK)
      .send("Already an admin with these credentials exist.");
  }
  const hashedPassword = await securePassword(password);
  const admin = await Multiverse_Admin.create({
    name,
    adminKey,
    email,
    password: hashedPassword,
    position,
  });
  const token = admin.createAccessToken();
  const refreshToken = admin.createRefreshToken();
  admin.refreshToken = refreshToken;
  admin.save();
  res
    .status(StatusCodes.OK)
    .json({ admin: { name: admin.name }, token, refreshToken });
};

//Controller 2
const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  const admin = await Multiverse_Admin.findOne({ email });
  if (!admin) {
    return res.status(StatusCodes.OK).send("Multiverse_Admin does not exist.");
  }
  const isPasswordCorrect = await bcrypt.compare(password, admin.password);
  const isAdminKeyCorrect = true;
  if (isPasswordCorrect && isAdminKeyCorrect) {
    const token = admin.createAccessToken();
    const refreshToken = admin.createRefreshToken();
    admin.refreshToken = refreshToken;
    admin.save();
    return res.status(StatusCodes.OK).json({
      admin: { name: admin.name, image: admin.image, _id: admin._id },
      token,
      refreshToken,
    });
  } else {
    return res.status(StatusCodes.OK).send("Invalid credentials!");
  }
};

//Controller 3
const regenerateAccessToken = async (req, res) => {
  const { refreshToken } = req.body;
  let id;
  try {
    const payload = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    id = payload.id;
  } catch (error) {
    console.log(error);
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send("Invalid refresh token...");
  }
  const admin = await Multiverse_Admin.findById(id);
  if (!admin) {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send("Invalid refresh token...");
  }
  if (admin.refreshToken !== refreshToken) {
    return res
      .status(StatusCodes.MISDIRECTED_REQUEST)
      .send("Invalid refresh token...");
  }
  const newRefreshToken = admin.createRefreshToken();
  const newAccessToken = admin.createAccessToken();
  admin.refreshToken = newRefreshToken;
  admin.save();
  return res.status(StatusCodes.OK).send({ newAccessToken, newRefreshToken });
};

module.exports = {
  registerAdmin,
  loginAdmin,
  regenerateAccessToken,
};
