import { Router } from 'express';
import {
  createItinerary,
  updateItineraryStatus,
  getOrderedItineraries,
  rsvpItinerary,
  addToNotifyList,
  getItinerariesByIds,
  fetchRSVPList,
  editItinerary,
} from '../controllers/itinerary.controller';

const router: Router = Router();

router.get('/', getOrderedItineraries);
router.get('/:itineraryId/rsvp', fetchRSVPList);
router.post('/', createItinerary);
router.post('/rsvp', rsvpItinerary);
router.post('/notify', addToNotifyList);
router.post('/bulk-fetch-by-ids', getItinerariesByIds);
router.patch('/status', updateItineraryStatus);
router.patch('/:itineraryId', editItinerary);

export default router;
