import { Router } from 'express';
import {
  giveAdditionalBadges,
  generateBadges,
  getUnusedBadges,
  giveBadge,
  updateUserImages,
} from '../controllers/Badge/badge.controller';

const router: Router = Router();

router.get('/unused', getUnusedBadges);
router.get('/update-images', updateUserImages);
router.post('/additional', giveAdditionalBadges);
router.post('/generate', generateBadges);
router.post('/give', giveBadge);
// router.get('/redundant', redundant);

export default router;
