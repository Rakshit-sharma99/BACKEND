const express = require("express");
const router = express.Router();

const {
  createItinerary,
  updateItineraryStatus,
  getOrderedItineraries,
  addToNotifyList,
  getItinerariesByIds,
  fetchRSVPList,
  editItinerary,
  rsvpItinerary,
} = require("../controllers/itineraryControllers");

router.post("/createItinerary", createItinerary);
router.post("/updateItineraryStatus", updateItineraryStatus);
router.get("/getOrderedItineraries", getOrderedItineraries);
router.post("/rsvpItinerary", rsvpItinerary);
router.post("/addToNotifyList", addToNotifyList);
router.post("/getItinerariesByIds", getItinerariesByIds);
router.get("/fetchRSVPList", fetchRSVPList);
router.post("/editItinerary", editItinerary);

module.exports = router;
