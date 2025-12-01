const express = require("express");
const router = express.Router();

const { insertNewFields, createOffer, getValidOffersForUser, availOffer, getBatchedOffers, addUserToVisibleTo, removeUserFromVisibleTo, generateCouponPdf, deleteOffer, getAvailedOffers, editOffer } = require("../controllers/offerControllers");

router.post("/createOffer", createOffer);
router.get("/getValidOffers", getValidOffersForUser);
router.post("/availOffer", availOffer);
router.get("/getBatchedOffers", getBatchedOffers);
router.post("/addUserToVisibleTo", addUserToVisibleTo);
router.post("/removeUserFromVisibleTo", removeUserFromVisibleTo);
router.get("/generateCouponPdf", generateCouponPdf);
router.get("/deleteOffer", deleteOffer);
router.get("/getAvailedOffers", getAvailedOffers);
router.post("/editOffer", editOffer);
router.post("/insertNewFields",insertNewFields)

module.exports = router;
