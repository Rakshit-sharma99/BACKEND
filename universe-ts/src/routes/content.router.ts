import { Router } from 'express';
import {
  createContent,
  likeContent,
  comment,
  unlikeContent,
  deleteComment,
  deleteContent,
  getContent,
  getComments,
  getContentBySpan,
  getContentForLanding,
  getRandomContent,
  getMacbContent,
  searchContentByTag,
  likeComment,
  unLikeComment,
  getPopularComments,
  redundancy,
  editContent,
  replyToComment,
  loadMoreContent,
  contentEmbedding,
  searchContent,
  searchByCommunity,
  generateHashTags,
} from '../controllers/content.controller';

const router: Router = Router();

router.get('/', getContent);
router.get('/:contentId/comments', getComments);
router.get('/:contentId/popular-comments', getPopularComments);
router.get('/:contentId/comment/:commentId/unlike', unLikeComment);
router.get('/content', getContentBySpan); // /content?span={today|week|all}
router.get('/get-content-for-landing', getContentForLanding);
router.get('/get-random-content', getRandomContent);
router.get('/macb-content', getMacbContent);
router.get('/search-by-tag', searchContentByTag);
router.get('/load-more-content', loadMoreContent);
router.get('/search', searchContent);
router.post('/', createContent);
router.post('/like', likeContent);
router.post('/comment', comment);
router.post('/:contentId/comment/:commentIndex/reply', replyToComment);
router.post('/embeddings', contentEmbedding);
router.post('/search-by-community', searchByCommunity);
router.post('/hashtags/generate', generateHashTags);
router.patch('/:contentId/comment/:commentId/like', likeComment);
router.patch('/:contentId', editContent);
router.delete('/redundancy', redundancy);
router.delete('/unlike', unlikeContent);
router.delete('/comment/delete', deleteComment);
router.delete('/:contentId', deleteContent);

export default router;
