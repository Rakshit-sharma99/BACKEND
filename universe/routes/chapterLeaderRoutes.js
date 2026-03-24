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
} = require("../controllers/chapterLeadearControllers");
const authenticate = require("../middlewares/authentication.js");

const router = Router();

router.get("/health", (req, res) => {
  res.json({ success: true, message: "Chapter leader service is running" });
});

router.post("/register", register);
router.post("/login",login);
router.post("/regenerateAccessToken", authenticate, regenerateAccessToken);
router.post("/verify", verifyChapterLeader);
router.post("/forgotPassword", forgotPassword);
router.post("/resetPassword", resetPassword);
router.get("/getChapterLeaderProgresses", authenticate, getChapterLeaderProgresses);
router.get("/getDetails", authenticate, getChapterLeaderDetails);
router.post("/claimReward", authenticate, claimQuestReward);
module.exports = router;