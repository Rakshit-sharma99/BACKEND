import { Router } from 'express';
import {
  getRandomVideos,
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
} from '../controllers/card.controller';

const router: Router = Router();

router.get('/:cardId', getCardFromId);
router.get('/all', getAllCards);
router.get('/liked', getLikedCards);
router.get('/user-cards', getCardsOfUser);
router.get('/tag/:tag', getCardsFromTag);
router.get('/interests', getYourInterests);
router.get('/bio/:userId', getUserBio);
router.get('/related-people', getPeopleRelatedToYou);
router.get('/random', getRandomCards);
router.get('/vector-search', vectorQuery);
router.get('/search', queryReturn);
router.get('/content/videos', getRandomVideos); // in replacement of the below given redundant route
// router.post('/redundant', redundant);
router.post('/', createCard);
router.post('/indexed-return', indexedReturn);
router.post('/vectorize', vectorEmbedding);
router.put('/interests', saveInterest);
router.patch('/modify', modifyCard);
router.patch('/like-card', likeACard);
router.patch('/unlike-card', unlikeACard);
router.delete('/:cardId', deleteCard);

export default router;
