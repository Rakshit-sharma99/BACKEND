const express = require("express");
const router = express.Router();

const {
  redundant,
  createCard,
  deleteCard,
  likeACard,
  getLikedCards,
  getCardFromId,
  getCardsOfUser,
  getCardsFromTag,
  saveInterest,
  getYourInterests,
  getAllCards,
  unlikeACard,
  getUserBio,
  getPeopleRelatedToYou,
  getRandomCards,
  indexedReturn,
  vectorEmbedding,
  vectorQuery,
  queryReturn,
  modifyCard,
  getCardsByIds,
  getRandomCardsForFeed,
} = require("../controllers/cardController");

router.post("/createCard", createCard);
router.post("/deleteCard", deleteCard);
router.post("/likeACard", likeACard);
router.get("/getLikedCards", getLikedCards);
router.post("/getCardFromId", getCardFromId);
router.get("/getCardsOfUser", getCardsOfUser);
router.post("/getCardsFromTag", getCardsFromTag);
router.post("/saveInterest", saveInterest);
router.get("/getYourInterests", getYourInterests);
router.get("/getAllCards", getAllCards);
router.post("/unlikeACard", unlikeACard);
router.get("/getUserBio", getUserBio);
router.get("/getPeopleRelatedToYou", getPeopleRelatedToYou);
router.get("/getRandomCards", getRandomCards);
router.post("/indexedReturn", indexedReturn);
router.post("/vectorEmbedding", vectorEmbedding);
router.get("/vectorQuery", vectorQuery);
router.post("/redundant", redundant);
router.get("/queryReturn", queryReturn);
router.post("/modifyCard", modifyCard);
router.post("/getCardsByIds", getCardsByIds);
router.get("/getRandomCardsForFeed", getRandomCardsForFeed);

module.exports = router;
