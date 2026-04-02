const express = require("express");
const router = express.Router();

const {
  AvgCommunityTimeToday,
  AvgCommunityTimeLastWeek,
  AvgCommunityTimeLastMonth,
  AvgCommunityTimeAllTime,
  TotalCommunityVisitsToday,
  TotalCommunityVisitsLastWeek,
  TotalCommunityVisitsLastMonth,
  TotalCommunityVisitsAllTime,
  TopNavigationFromCommunity, // Not Working
  TotalCommunityTimeAllTime,
  CommunityVisitTimeClusters,
  BounceRateCommunityToday,
  BounceRateCommunityLastWeek,
  BounceRateCommunityLastMonth,
  BounceRateCommunityAllTime,
  SingleHitCommunitySessionsToday,
  SingleHitCommunitySessionsLastWeek,
  SingleHitCommunitySessionsLastMonth,
  SingleHitCommunitySessionsAllTime,
  PeakCommunityUsageHourly,  // working
  AvgRequestsPerCommunityVisitToday,
  AvgRequestsPerCommunityVisitLastWeek,
  AvgRequestsPerCommunityVisitLastMonth,
  AvgRequestsPerCommunityVisitAllTime,
  CommunityToEventConversionRate,
  ReturningCommunityUsers,
  MedianCommunityTime
} = require("../controllers/communityMetaControllers");

// Average community time
router.get("/AvgCommunityTimeToday", AvgCommunityTimeToday);
router.get("/AvgCommunityTimeLastWeek", AvgCommunityTimeLastWeek);
router.get("/AvgCommunityTimeLastMonth", AvgCommunityTimeLastMonth);
router.get("/AvgCommunityTimeAllTime", AvgCommunityTimeAllTime);

// Total community visits
router.get("/TotalCommunityVisitsToday", TotalCommunityVisitsToday);
router.get("/TotalCommunityVisitsLastWeek", TotalCommunityVisitsLastWeek);
router.get("/TotalCommunityVisitsLastMonth", TotalCommunityVisitsLastMonth);
router.get("/TotalCommunityVisitsAllTime", TotalCommunityVisitsAllTime);

// Top navigation from community
router.get("/TopNavigationFromCommunity", TopNavigationFromCommunity);

// Total community time all time
router.get("/TotalCommunityTimeAllTime", TotalCommunityTimeAllTime);

// Community visit time clusters
router.get("/CommunityVisitTimeClusters", CommunityVisitTimeClusters);

// Bounce rate community
router.get("/BounceRateCommunityToday", BounceRateCommunityToday);
router.get("/BounceRateCommunityLastWeek", BounceRateCommunityLastWeek);
router.get("/BounceRateCommunityLastMonth", BounceRateCommunityLastMonth);
router.get("/BounceRateCommunityAllTime", BounceRateCommunityAllTime);

// Single hit community sessions
router.get("/SingleHitCommunitySessionsToday", SingleHitCommunitySessionsToday);
router.get("/SingleHitCommunitySessionsLastWeek", SingleHitCommunitySessionsLastWeek);
router.get("/SingleHitCommunitySessionsLastMonth", SingleHitCommunitySessionsLastMonth);
router.get("/SingleHitCommunitySessionsAllTime", SingleHitCommunitySessionsAllTime);

// Peak community usage hourly
router.get("/PeakCommunityUsageHourly", PeakCommunityUsageHourly);

// Average requests per community visit
router.get("/AvgRequestsPerCommunityVisitToday", AvgRequestsPerCommunityVisitToday);
router.get("/AvgRequestsPerCommunityVisitLastWeek", AvgRequestsPerCommunityVisitLastWeek);
router.get("/AvgRequestsPerCommunityVisitLastMonth", AvgRequestsPerCommunityVisitLastMonth);
router.get("/AvgRequestsPerCommunityVisitAllTime", AvgRequestsPerCommunityVisitAllTime);

// Community to event conversion rate
router.get("/CommunityToEventConversionRate", CommunityToEventConversionRate);

// Returning community users
router.get("/ReturningCommunityUsers", ReturningCommunityUsers);

// Median community time
router.get("/MedianCommunityTime", MedianCommunityTime);

module.exports = router;