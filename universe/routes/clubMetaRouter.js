const express = require("express");
const router=express.Router();
const {
    AvgClubTimeToday,
    AvgClubTimeLastWeek,
    AvgClubTimeLastMonth,
    AvgClubTimeAllTime,
    TotalClubVisitsToday,
    TotalClubVisitsLastWeek,
    TotalClubVisitsLastMonth,
    TotalClubVisitsAllTime,
    TopNavigationFromClub,
    TotalClubTimeAllTime,
    ClubVisitTimeClusters,
    BounceRateClubToday,
    BounceRateClubLastWeek,
    BounceRateClubLastMonth,
    BounceRateClubAllTime,
    SingleHitClubSessionsToday,
    SingleHitClubSessionsLastWeek,
    SingleHitClubSessionsLastMonth,
    SingleHitClubSessionsAllTime,
    PeakClubUsageHourly,
    AvgRequestsPerClubVisitToday,
    AvgRequestsPerClubVisitLastWeek,
    AvgRequestsPerClubVisitLastMonth,
    AvgRequestsPerClubVisitAllTime,
    ClubEngagementRate,
    ClubStickinessRate,
    ClubDeepNavigationRate,
    ClubDiscoveryFromEventsRate,
    ReturningClubUsers,
    MedianClubTime

}=require("../controllers/clubMetaController");

router.get("/avgClubTimeToday",AvgClubTimeToday);
router.get("/avgClubTimeLastWeek",AvgClubTimeLastWeek);
router.get("/avgClubTimeLastMonth",AvgClubTimeLastMonth);
router.get("/avgClubTimeAllTime",AvgClubTimeAllTime);
router.get("/totalClubVisitsToday",TotalClubVisitsToday);
router.get("/totalClubVisitsLastWeek",TotalClubVisitsLastWeek);
router.get("/totalClubVisitsLastMonth",TotalClubVisitsLastMonth);
router.get("/totalClubVisitsAllTime",TotalClubVisitsAllTime);
router.get("/topNavigationFromClub",TopNavigationFromClub);
router.get("/totalClubTimeAllTime",TotalClubTimeAllTime);
router.get("/clubVisitTimeClusters",ClubVisitTimeClusters);
router.get("/bounceRateClubToday",BounceRateClubToday);
router.get("/bounceRateClubLastWeek",BounceRateClubLastWeek);
router.get("/bounceRateClubLastMonth",BounceRateClubLastMonth);
router.get("/bounceRateClubAllTime",BounceRateClubAllTime);
router.get("/singleHitClubSessionsToday",SingleHitClubSessionsToday);
router.get("/singleHitClubSessionsLastWeek",SingleHitClubSessionsLastWeek);
router.get("/singleHitClubSessionsLastMonth",SingleHitClubSessionsLastMonth);
router.get("/singleHitClubSessionsAllTime",SingleHitClubSessionsAllTime);
router.get("/peakClubUsageHourly",PeakClubUsageHourly);
router.get("/avgRequestsPerClubVisitToday",AvgRequestsPerClubVisitToday);
router.get("/avgRequestsPerClubVisitLastWeek",AvgRequestsPerClubVisitLastWeek);
router.get("/avgRequestsPerClubVisitLastMonth",AvgRequestsPerClubVisitLastMonth);
router.get("/avgRequestsPerClubVisitAllTime",AvgRequestsPerClubVisitAllTime);
router.get("/clubEngagementRate",ClubEngagementRate);
router.get("/clubStickinessRate",ClubStickinessRate);
router.get("/clubDeepNavigationRate",ClubDeepNavigationRate);
router.get("/clubDiscoveryFromEventsRate",ClubDiscoveryFromEventsRate);
router.get("/returningClubUsers",ReturningClubUsers);
router.get("/medianClubTime",MedianClubTime);

module.exports=router;