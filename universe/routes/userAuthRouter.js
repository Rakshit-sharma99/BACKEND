const express = require("express");
const router = express.Router();

const rateLimit = require("express-rate-limit");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Allow only 10 requests per 15 minutes per IP
  message: { error: "IP blocked." },
});

const {
  loginUser,
  registerUser,
  googleRegister,
  googleLogin,
  recoveryEmail,
  setOtp,
  setNewPassword,
  pushToken,
  userNameAvailable,
  emailVerification,
  regenerateAccessToken,
  generateAbout,
  generateResearchAreas,
  generateInterest,
  reactivateAccount,
  emailVerification2,
  getAppConfig,
  suggestUsername,
  getUploadUrl,
  copyObject,
  appleRegister,
  appleLogin,
  sendOtpEmailForSignup,
  verifyOtpEmailForSignup,
  copyImage,
  forgotPassword,
  resetPassword,
  webPushToken,
  storeUnregisteredDevices,
  nameAndMailExistence,
  getTopClubsCommunities
} = require("../controllers/userAuthControllers");
const {
  registerUserValidator,
} = require("../controllers/validators/user.validator");

router.post("/register", registerUserValidator, registerUser);
router.post("/register/google", googleRegister);
router.post("/login", loginUser);
router.post("/login/google", googleLogin);
router.post("/recoveryEmail", recoveryEmail);
router.post("/setOtp", setOtp);
router.post("/setNewPassword", setNewPassword);
router.get("/pushToken", pushToken);
router.get("/userNameAvailable", userNameAvailable);
router.get("/emailVerification", emailVerification);
router.post(
  "/regenerateAccessToken-72f8c570-2a36-11ec-8d3d-0242ac130003",
  regenerateAccessToken,
);
router.post("/generateAbout", generateAbout);
router.get("/generateResearchAreas", generateResearchAreas);
router.post("/generateInterest", generateInterest);
router.post("/reactivateAccount", reactivateAccount);
router.get("/getAppConfig", getAppConfig);
router.get("/suggestUsername", suggestUsername);
router.post("/getUploadUrl", getUploadUrl);
router.post("/copyObject", copyObject);
router.get("/getAppConfig", getAppConfig);
router.post("/register/apple", appleRegister);
router.post("/login/apple", appleLogin);
router.get("/sendOtpEmailForSignup", sendOtpEmailForSignup);
router.post("/verifyOtpEmailForSignup", verifyOtpEmailForSignup);
router.post("/copyImage", authLimiter, copyImage);
router.post('/forgotPassword', forgotPassword)
router.post('/resetPassword', resetPassword);
router.get("/webPushToken", webPushToken)
router.post("/storeUnregisteredDevices", storeUnregisteredDevices);
router.post("/nameAndMailExistence", nameAndMailExistence);
router.get("/getTopClubsCommunities", getTopClubsCommunities);
module.exports = router;
