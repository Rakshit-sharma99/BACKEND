import { Router } from 'express';
import {
  createResource,
  getResources,
  getResourceById,
  submitReview,
  getReviews,
  getResource,
  logResourceDownload,
  searchResources,
  deleteResource,
  getRecommendedNotes,
  searchFromAllResources,
} from '../controllers/resource.controller';

const router: Router = Router();

router.get('/', getResources);
router.get('/:id', getResourceById);
router.get('/:resourceId', getResource);
router.get('/search', searchResources);
router.get('/search-all', searchFromAllResources);
router.get('/reviews', getReviews);
router.get('/notes/recommended', getRecommendedNotes);
router.get('/log-resource-download', logResourceDownload);
router.post('/', createResource);
router.post('/reviews/submit', submitReview);
router.delete('/:resourceId', deleteResource);

export default router;
