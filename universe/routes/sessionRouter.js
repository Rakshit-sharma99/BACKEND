const express = require("express");
const router = express.Router();

const {
    getAllSessions,
    getTodaySessionCount,
    averageSessionTime,
    getTodayUser,
    getTotalUsers,
    getLiveEvents,
    getTodaySessions,
    getWeekSessions,
    getMonthSessions,
    getHighestSessions,
    getTodaySignups,
    getLastWeekSignups,
    getLastMonthSignups,
    todaySessionDonut,
    lastWeekSessionDonut,
    lastMonthSessionDonut,
    todaySessionsByTimeOfDay,
    lastWeekSessionsByTimeOfDay,
    lastMonthSessionsByTimeOfDay
} = require("../controllers/sessionControllers");

router.get("/getAllSessions", getAllSessions);
router.get("/getTodaySessionCount", getTodaySessionCount);
router.get("/averageSessionTime", averageSessionTime);
router.get("/getTodayUser", getTodayUser);
router.get("/getTotalUsers", getTotalUsers);
router.get("/getLiveEvents", getLiveEvents);
router.get("/getTodaySessions", getTodaySessions);
router.get("/getWeekSessions", getWeekSessions);
router.get("/getMonthSessions", getMonthSessions);
router.get("/getHighestSessions", getHighestSessions);
router.get("/getTodaySignups", getTodaySignups);
router.get("/getLastWeekSignups", getLastWeekSignups);
router.get("/getLastMonthSignups", getLastMonthSignups);
router.get("/todaySessionDonut", todaySessionDonut);
router.get("/lastWeekSessionDonut", lastWeekSessionDonut);
router.get("/lastMonthSessionDonut", lastMonthSessionDonut);
router.get("/todaySessionsByTimeOfDay", todaySessionsByTimeOfDay);
router.get("/lastWeekSessionsByTimeOfDay", lastWeekSessionsByTimeOfDay);
router.get("/lastMonthSessionsByTimeOfDay", lastMonthSessionsByTimeOfDay);

module.exports = router;
