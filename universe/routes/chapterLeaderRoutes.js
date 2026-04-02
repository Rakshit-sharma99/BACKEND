const { Router } = require("express");
const {
  register,
  login,
  regenerateAccessToken,
  verifyChapterLeader,
  getChapterLeaderProgresses,
  getChapterLeaderDetails,
  claimQuestReward,
  forgotPassword,
  resetPassword,
  addAddress,
  updateAddress,
  deleteAddress,
  getAllAddresses,
  sendMailForApply,
  getUnapprovedLeaders
} = require("../controllers/chapterLeaderControllers.js");
const authenticate = require("../middlewares/authentication.js");

const router = Router();

router.get("/health", (req, res) => {
  res.json({ success: true, message: "Chapter leader service is running" });
});

router.post("/register", register);
router.post("/login", login);
router.post("/regenerateAccessToken", regenerateAccessToken);
router.post("/verify",authenticate, verifyChapterLeader);
router.post("/forgotPassword", forgotPassword);
router.post("/resetPassword", resetPassword);
router.get("/getChapterLeaderProgresses", authenticate, getChapterLeaderProgresses);
router.get("/getDetails", authenticate, getChapterLeaderDetails);
router.post("/claimReward", authenticate, claimQuestReward);
router.post("/addAddress", authenticate, addAddress);
router.get("/getAddresses", authenticate, getAllAddresses);
router.put("/updateAddress/:addressId", authenticate, updateAddress);
router.delete("/deleteAddress/:addressId", authenticate, deleteAddress);
router.post("/sendMailForApply", authenticate, sendMailForApply);
router.get("/getUnapprovedLeaders", authenticate, getUnapprovedLeaders);
module.exports = router;