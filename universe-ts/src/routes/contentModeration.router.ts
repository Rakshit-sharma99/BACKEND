import { Router } from 'express';
import {
  submitForReview,
  readContentForModeration,
  discardReviewClaim,
  addDiscretion,
} from '../controllers/contentModeration.controller';

const router: Router = Router();

router.get('/read-content-for-moderation', readContentForModeration);
router.post('/submit-for-review', submitForReview);
router.post('/add-discretion', addDiscretion);
router.delete('/discard-review-claim', discardReviewClaim);

export default router;
