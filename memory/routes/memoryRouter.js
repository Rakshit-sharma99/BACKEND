const express = require("express");
const router = express.Router();

const {
  createMemory,
  getMemories,
  getOthersMemories,
  editMemory,
  removeMemoryRequest,
  saveMemoryRequest,
  unsaveMemoryRequest,
  deleteMemory,
  setMemoryPinned,
  getMemoryById,
  fetchMemoryCollections,
  getCalendarDataByMonth,
  getMemoriesByDate,
  getMemoriesByTemplate,
  searchMemory,
  getFriendLinkedMemories,
  getMonthlyMedia,
  getCertificateMemories,
  getMemoryCount,
  insertNewFields,
  getMemoryRequest,
  getMemoryTimeline,
  getMemoriesByMonthPaginated,
  getMemoryBin,
  restoreMemoryRequest,
  deleteFromBin,
} = require("../controllers/memoryControllers");

router.post("/createMemory", createMemory);
router.get("/getMemories", getMemories);
router.get("/getOthersMemories", getOthersMemories);
router.patch("/editMemory", editMemory);
router.post("/removeMemoryRequest", removeMemoryRequest);
router.post("/saveMemoryRequest", saveMemoryRequest);
router.post("/unsaveMemoryRequest", unsaveMemoryRequest);
router.delete("/deleteMemory", deleteMemory);
router.patch("/setMemoryPinned", setMemoryPinned);
router.get("/getMemoryById", getMemoryById);
router.get("/fetchMemoryCollections", fetchMemoryCollections);
router.get("/getCalendarDataByMonth", getCalendarDataByMonth);
router.get("/getMemoriesByDate", getMemoriesByDate);
router.get("/getMemoriesByTemplate", getMemoriesByTemplate);
router.get("/searchMemory", searchMemory);
router.get("/getFriendLinkedMemories", getFriendLinkedMemories);
router.get("/getMonthlyMedia", getMonthlyMedia);
router.get("/getCertificateMemories", getCertificateMemories);
router.get("/getMemoryCount", getMemoryCount);
router.post("/insertNewFields", insertNewFields);
router.get("/getMemoryRequest", getMemoryRequest);
router.get("/getMemoryTimeline", getMemoryTimeline);
router.get("/getMemoriesByMonth", getMemoriesByMonthPaginated);
router.get("/getMemoryBin", getMemoryBin);
router.post("/restoreMemoryRequest", restoreMemoryRequest);
router.delete("/deleteFromBin", deleteFromBin);

module.exports = router;
