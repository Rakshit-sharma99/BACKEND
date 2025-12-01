import { Router } from 'express';
import {
  generateTicket,
  scanTicket,
  reviewEvent,
  likeReview,
  unLikeReview,
} from '../controllers/ticket.controller';

const router: Router = Router();

router.post('/', generateTicket);
router.patch('/scan', scanTicket);
router.patch('/review', reviewEvent);
router.patch('/review/like', likeReview);
router.patch('/review/unlike', unLikeReview);

export default router;
