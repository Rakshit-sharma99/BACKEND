const express = require("express");
const router = express.Router();

const {
  createCard,
  deleteCard,
  likeACard,
  unlikeACard,
  getLikedCards,
  getCardFromId,
  getCardsOfUser,
  getCardsFromTag,
  getYourInterests,
  getRandomCards,
  queryReturn,
  getCardsByIds,
  getRandomCardsForFeed,
  indexedReturn,
  getSearchedCards,
} = require("../controllers/cardController");

router.post("/createCard", createCard);
router.post("/deleteCard", deleteCard);
router.post("/likeACard", likeACard);
router.post("/unlikeACard", unlikeACard);
router.get("/getLikedCards", getLikedCards);
router.post("/getCardFromId", getCardFromId);
router.get("/getCardsOfUser", getCardsOfUser);
router.post("/getCardsFromTag", getCardsFromTag);
router.get("/getYourInterests", getYourInterests);
router.get("/getRandomCards", getRandomCards);
router.get("/queryReturn", queryReturn);
router.post("/getCardsByIds", getCardsByIds);
router.get("/getRandomCardsForFeed", getRandomCardsForFeed);
router.post("/indexedReturn", indexedReturn);
router.get("/getSearchedCards", getSearchedCards);

module.exports = router;
