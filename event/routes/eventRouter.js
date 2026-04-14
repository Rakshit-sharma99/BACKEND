const express = require("express");
const router = express.Router();

const {
  createEvent,
  getAllEvents,
  changeEventStatus,
  deleteEvent,
  getTicketsBought,
  getEventAnalytics,
  getCustomAnalytics,
  addPredefinedQues,
  removePredefinedQues,
  askQuestion,
  answerTheQuestion,
  getFaq,
  changeStatusJob,
  getTickets,
  canBuyTicket,
  generateTicketListPdf,
  getReviews,
  checkTicketAvailability,
  checkLiveAttendance,
  askForReviewSubmission,
  getAllTicketsBought,
  getEvents,
  checkEventStatus,
  getEventById,
  setEventLayout,
  editEventDetails,
  searchEvents,
  mailEventStats,
  getPastOrFutureEvents,
  getEventFieldsById,
  checkEventAuthorization,
  getPastEvents,
  getEventGallery,
  addExtraFieldsToEvent,
  promoteEvent,
  demoteEvent,
  getEventPermissions,
  assignDefaultPermissions,
  updateEventPermission,
  addToGallery,
  getEventGalleryPaginated,
  getEventGalleryContributors,
  changeGalleryFeatured,
  addTagsToEvent,
  getCurrentWeekEvents,
  getPromotedEvents,
  getTopPastEvents,
  addExtraFieldsToTicketType,
  getLatestEvents,
  toggleWaitlist,
  getSearchedEvents,
  insertNewFields,
  getFeaturedEvents,
  getFeaturedEventsForFeed,
  requestCancellation,
  requestPostponement,
  requestEventLive,
  cancelEvent,
  slugifyAllEvents,
} = require("../controllers/eventControllers");

const eventFunnelRoutes = require("./eventfunnelRoutes");

router.use("/funnel", eventFunnelRoutes);

router.post("/createEvent", createEvent);
router.get("/getAllEvents", getAllEvents);
router.get("/changeEventStatus", changeEventStatus);
router.post("/deleteEvent", deleteEvent);
router.get("/getTicketsBought", getTicketsBought);
router.get("/getEventAnalytics", getEventAnalytics);
router.get("/getCustomAnalytics", getCustomAnalytics);
router.post("/addPredefinedQues", addPredefinedQues);
router.post("/removePredefinedQues", removePredefinedQues);
router.post("/askQuestion", askQuestion);
router.post("/answerTheQuestion", answerTheQuestion);
router.get("/getFaq", getFaq);
router.get("/changeStatusJob", changeStatusJob);
router.get("/getTickets", getTickets);
router.get("/generateTicketListPdf", generateTicketListPdf);
router.get("/getReviews", getReviews);
router.get("/checkTicketAvailability", checkTicketAvailability);
router.get("/checkLiveAttendance", checkLiveAttendance);
router.get("/askForReviewSubmission", askForReviewSubmission);
router.get("/getAllTicketsBought", getAllTicketsBought);
router.get("/getEvents", getEvents);
router.get("/checkEventStatus", checkEventStatus);
router.get("/getEventById", getEventById);
router.post("/setEventLayout", setEventLayout);
router.post("/editEventDetails", editEventDetails);
router.get("/searchEvents", searchEvents);
router.get("/mailEventStats", mailEventStats);
router.get("/getPastOrFutureEvents", getPastOrFutureEvents);
router.post("/getEventFieldsById", getEventFieldsById);
router.get("/checkEventAuthorization", checkEventAuthorization);
router.post("/getPastEvents", getPastEvents);
router.post("/getEventGallery", getEventGallery);
router.post("/addExtraFieldsToEvent", addExtraFieldsToEvent);
router.post("/promoteEvent", promoteEvent);
router.post("/demoteEvent", demoteEvent);
router.get("/getEventPermissions", getEventPermissions);
router.post("/assignDefaultPermissions", assignDefaultPermissions);
router.post("/updateEventPermission", updateEventPermission);
router.post("/addToGallery", addToGallery);
router.get("/getEventGalleryPaginated", getEventGalleryPaginated);
router.get("/getEventGalleryContributors", getEventGalleryContributors);
router.post("/changeGalleryFeatured", changeGalleryFeatured);
router.post("/addTagsToEvent", addTagsToEvent);
router.get("/getCurrentWeekEvents", getCurrentWeekEvents);
router.get("/getPromotedEvents", getPromotedEvents);
router.get("/getTopPastEvents", getTopPastEvents);
router.post("/addExtraFieldsToTicketType", addExtraFieldsToTicketType);
router.get("/getLatestEvents", getLatestEvents);
router.post("/toggleWaitlist", toggleWaitlist);
router.get("/getSearchedEvents", getSearchedEvents);
router.post("/insertNewFields", insertNewFields);
router.post("/getFeaturedEvents", getFeaturedEvents);
router.get("/getLandingEvent", getFeaturedEventsForFeed);
router.post("/requestCancellation", requestCancellation);
router.post("/cancelEvent", cancelEvent)
router.get("/requestEventLive", requestEventLive)
router.post("/requestPostponement", requestPostponement)
router.get("/slugifyAllEvents", slugifyAllEvents);
router.post("/canBuyTicket", canBuyTicket);

module.exports = router;
