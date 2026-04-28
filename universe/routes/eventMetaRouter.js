const express = require("express");
const router = express.Router();

const {
    AvgEventTimeToday,
    AvgEventTimeLastWeek,
    AvgEventTimeLastMonth,
    AvgEventTimeAllTime,
    TotalEventVisitsToday,
    TotalEventVisitsLastWeek,
    TotalEventVisitsLastMonth,
    TotalEventVisitsAllTime,
    TopNavigationFromEvent,
    TotalEventTimeAllTime,
    EventVisitTimeClusters,
    BounceRateEventToday,
    BounceRateEventLastWeek,
    BounceRateEventLastMonth,
    BounceRateEventAllTime,
    SingleHitEventSessionsToday,
    SingleHitEventSessionsLastWeek,
    SingleHitEventSessionsLastMonth,
    SingleHitEventSessionsAllTime,
    PeakEventUsageHourly,
    AvgRequestsPerEventVisitToday,
    AvgRequestsPerEventVisitLastWeek,
    AvgRequestsPerEventVisitLastMonth,
    AvgRequestsPerEventVisitAllTime,
    EventToClubConversionRate,
    ReturningEventUsers,
    MedianEventTime
} = require("../controllers/eventMetaController");

router.get("/AvgEventTimeToday", AvgEventTimeToday);
router.get("/AvgEventTimeLastWeek", AvgEventTimeLastWeek);
router.get("/AvgEventTimeLastMonth", AvgEventTimeLastMonth);
router.get("/AvgEventTimeAllTime", AvgEventTimeAllTime);
router.get("/TotalEventVisitsToday", TotalEventVisitsToday);
router.get("/TotalEventVisitsLastWeek", TotalEventVisitsLastWeek);
router.get("/TotalEventVisitsLastMonth", TotalEventVisitsLastMonth);
router.get("/TotalEventVisitsAllTime", TotalEventVisitsAllTime);
router.get("/TopNavigationFromEvent", TopNavigationFromEvent);
router.get("/TotalEventTimeAllTime", TotalEventTimeAllTime);
router.get("/EventVisitTimeClusters", EventVisitTimeClusters);
router.get("/BounceRateEventToday", BounceRateEventToday);
router.get("/BounceRateEventLastWeek", BounceRateEventLastWeek);
router.get("/BounceRateEventLastMonth", BounceRateEventLastMonth);
router.get("/BounceRateEventAllTime", BounceRateEventAllTime);
router.get("/SingleHitEventSessionsToday", SingleHitEventSessionsToday);
router.get("/SingleHitEventSessionsLastWeek", SingleHitEventSessionsLastWeek);
router.get("/SingleHitEventSessionsLastMonth", SingleHitEventSessionsLastMonth);
router.get("/SingleHitEventSessionsAllTime", SingleHitEventSessionsAllTime);
router.get("/PeakEventUsageHourly", PeakEventUsageHourly);
router.get("/AvgRequestsPerEventVisitToday", AvgRequestsPerEventVisitToday);
router.get("/AvgRequestsPerEventVisitLastWeek", AvgRequestsPerEventVisitLastWeek);
router.get("/AvgRequestsPerEventVisitLastMonth", AvgRequestsPerEventVisitLastMonth);
router.get("/AvgRequestsPerEventVisitAllTime", AvgRequestsPerEventVisitAllTime);
router.get("/EventToClubConversionRate", EventToClubConversionRate);
router.get("/ReturningEventUsers", ReturningEventUsers);
router.get("/MedianEventTime", MedianEventTime);

module.exports = router;