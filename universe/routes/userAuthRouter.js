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
} = require("../controllers/userAuthControllers");

router.post("/register", registerUser);
router.post("/register/google", googleRegister);
router.post("/login", loginUser);
router.post('/login/google', googleLogin);
router.post("/recoveryEmail", recoveryEmail);
router.post("/setOtp", setOtp);
router.post("/setNewPassword", setNewPassword);
router.get("/pushToken", pushToken);
router.get("/userNameAvailable", userNameAvailable);
router.get("/emailVerification", emailVerification);
router.post(
  "/regenerateAccessToken-72f8c570-2a36-11ec-8d3d-0242ac130003",
  regenerateAccessToken
);
router.post("/generateAbout", generateAbout);
router.get("/generateResearchAreas", generateResearchAreas);
router.post("/generateInterest", generateInterest);
router.post("/reactivateAccount", reactivateAccount);

module.exports = router;
