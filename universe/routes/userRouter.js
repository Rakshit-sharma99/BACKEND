const express = require("express");
const router = express.Router();
const {
  getUser,
  updateUser,
  deleteUser,
  getUserByToken,
  searchUserByName,
  getUserBio,
  advanceSearch,
  getAllUsers,
  randomUsers,
  changePassword,
  pushPermanentNotice,
  getPermanentNotices,
  deleteNotifications,
  getCommunitiesForPost,
  getPermanentNoticeInBatch,
  sendMailToUsers,
  getBasicUserBio,
  sendNotification,
  deactivateAccount,
  cleanUp,
  search,
  fetchMultipleProfiles,
  tuneIn,
  untune,
  getProfessorRecommendations,
  searchFromAllProfessors,
  sendMailVerification,
  verifyEmail,
  completeProfile,
  sendBatchedNotifications,
  getInactiveUsers,
  updateIncompleteFields,
  getUserById,
  changeIp,
  getUsersBySignupDate,
  getUserFieldsById,
  readContentTeam,
  removeFromTeam,
  getContentTeamAdmins,
  addToContentTeam,
  saveInterest,
  insertNewFields,
  getMemoryListUsers,
  getSearchResults,
  getTuners,
  getMemoryListRecommendation,
  addUniverseMetaDataToShortcuts,
} = require("../controllers/userControllers");

router.route("/").get(getUser).patch(updateUser).delete(deleteUser);
router.get("/getUserByToken", getUserByToken);
router.get("/searchUserByName", searchUserByName);
router.get("/getUserBio", getUserBio);
router.get("/advanceSearch", advanceSearch);
router.get("/getAllUsers", getAllUsers);
router.get("/randomUsers", randomUsers);
router.post("/changePassword", changePassword);
router.post("/pushPermanentNotice", pushPermanentNotice);
router.get("/getPermanentNotices", getPermanentNotices);
router.post("/deleteNotifications", deleteNotifications);
router.get("/getCommunitiesForPost", getCommunitiesForPost);
router.get("/getPermanentNoticeInBatch", getPermanentNoticeInBatch);
router.post("/sendMailToUsers", sendMailToUsers);
router.get("/getBasicUserBio", getBasicUserBio);
router.post("/sendNotification", sendNotification);
router.post("/deactivateAccount", deactivateAccount);
router.post("/cleanUp", cleanUp);
router.get("/search", search);
router.post("/fetchMultipleProfiles", fetchMultipleProfiles);
router.get("/tuneIn", tuneIn);
router.get("/untune", untune);
router.get("/getProfessorRecommendations", getProfessorRecommendations);
router.get("/searchFromAllProfessors", searchFromAllProfessors);
router.post("/sendMailVerification", sendMailVerification);
router.post("/verifyEmail", verifyEmail);
router.post("/completeProfile", completeProfile);
router.post("/sendBatchedNotifications", sendBatchedNotifications);
router.post("/sendMailVerification", sendMailVerification);
router.post("/verifyEmail", verifyEmail);
router.post("/completeProfile", completeProfile);
(router.get("/getInactiveUsers", getInactiveUsers),
  router.post("/updateIncompleteFields", updateIncompleteFields));
router.get("/getUserById", getUserById);
router.post("/changeIp", changeIp);
router.get("/getUsersBySignupDate", getUsersBySignupDate);
router.post("/getUserFieldsById", getUserFieldsById);
router.get("/addToContentTeam", addToContentTeam);
router.get("/readContentTeam", readContentTeam);
router.get("/removeFromTeam", removeFromTeam);
router.get("/getContentTeamAdmins", getContentTeamAdmins);
router.post("/saveInterest", saveInterest);
router.post("/insertNewFields", insertNewFields);
router.get("/getMemoryListUsers", getMemoryListUsers);
router.get("/getSearchResults", getSearchResults);
router.get("/getTuners", getTuners);
router.get("/getMemoryListRecommendation", getMemoryListRecommendation);
router.post("/addUniverseMetaDataToShortcuts", addUniverseMetaDataToShortcuts);

module.exports = router;
