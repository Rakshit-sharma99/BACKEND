const { StatusCodes } = require("http-status-codes");
const Admin = require("../models/admin");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
require("dotenv").config();
const { sendMail } = require("../controllers/utils");

//Refer to Admin Authorization Documentation

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
  const { name, adminKey, email, password } = req.body;
  const existingAdmin = await Admin.findOne({ name, adminKey, email });
  if (existingAdmin) {
    return res
      .status(StatusCodes.OK)
      .send("Already an admin with these credentials exist.");
  }
  const hashedPassword = await securePassword(password);
  const admin = await Admin.create({
    name,
    adminKey,
    email,
    password: hashedPassword,
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
  const admin = await Admin.findOne({ email });
  if (!admin) {
    return res.status(StatusCodes.OK).send("Admin does not exist.");
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
  const admin = await Admin.findById(id);
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

//function to check if the admin exists. If it exists then setting a recoveryOtp and returning it
const setOtp = async (req, res) => {
  const { adminEmail } = req.body;
  try {
    let admin = await Admin.findOne(
      { email: adminEmail },
      { name: 1, recoveryOtp: 1 }
    );
    if (!admin)
      return res.status(StatusCodes.OK).send("Admin does not exists.");
    const otp = Math.floor(100000 + Math.random() * 900000);
    admin.recoveryOtp = otp;
    admin.save();
    const intro = [
      "You have received this email because a password reset request for your account was received.",
      `The OTP is ${otp}`,
    ];
    const outro =
      "If you did not request a password reset, no further action is required on your part.";
    const subject = "Password Recovery";
    const destination = [adminEmail];
    const { ses, params } = await sendMail(
      admin.name,
      intro,
      outro,
      subject,
      destination
    );
    ses.sendEmail(params, function (err, data) {
      if (err) {
        console.log(err, err.stack);
        return res.status(StatusCodes.OK).send("Something went wrong.");
      } else {
        return res
          .status(StatusCodes.OK)
          .json({ msg: "OTP sent successfully.", otp: admin.recoveryOtp });
      }
    });
  } catch (error) {
    console.log(error);
    return res.status(StatusCodes.OK).json("Something went wrong.");
  }
};

//function to set new password through email verification
const setNewPassword = async (req, res) => {
  let { otp, newPass, adminEmail } = req.body;
  let admin = await Admin.findOne(
    { adminEmail },
    { password: 1, recoveryOtp: 1 }
  );
  if (!admin) return res.status(StatusCodes.OK).send("Admin does not exists.");
  let encryptedPassword = await securePassword(newPass);
  const fixedOtp = admin.recoveryOtp;
  if (fixedOtp === otp) {
    admin.password = encryptedPassword;
    admin.save();
    return res.status(StatusCodes.OK).send("Password changed successfully.");
  } else {
    return res.status(StatusCodes.OK).send("Verification failed.");
  }
};

module.exports = {
  registerAdmin,
  loginAdmin,
  regenerateAccessToken,
  setOtp,
  setNewPassword,
};
