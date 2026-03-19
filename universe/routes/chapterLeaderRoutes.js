const { Router } = require("express");
const {
  register,
  login,
  regenerateAccessToken,
  verifyChapterLeader,
  getQuestsProgress,
  setOtp,
  recoveryEmail,
  setNewPassword,
  getChapterLeaderDetails,
  claimQuestReward,
} = require("../controllers/chapterLeadearControllers");
const authenticate = require("../middlewares/authentication.js");

const router = Router();

router.get("/health", (req, res) => {
  res.json({ success: true, message: "Chapter leader service is running" });
});

// ── Public routes ──────────────────────────────────────────────────────────
router.post("/register", register);
router.post("/login",    login);

// ── Auth required ──────────────────────────────────────────────────────────
router.post("/regenerateAccessToken", authenticate, regenerateAccessToken);

// Admin only – verify a chapter leader & assign quests
router.post("/verify", verifyChapterLeader);

// Chapter leader – get their quest progress (optionally ?category=Club|Community|Event)
router.get("/getQuestsProgress", authenticate, getQuestsProgress);

// Get Chapter Leader Details
router.get("/getDetails", authenticate, getChapterLeaderDetails);

// Claim Quest Reward
router.post("/claimReward", authenticate, claimQuestReward);

// Forgot Password
router.post("/setOtp", setOtp);
router.post("/recoveryEmail", recoveryEmail);
router.post("/setNewPassword", setNewPassword);

module.exports = router;