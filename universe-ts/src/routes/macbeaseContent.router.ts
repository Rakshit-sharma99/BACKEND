import { Router } from 'express';
import {
  createContent,
  likeContent,
  comment,
  unlikeContent,
  deleteContent,
  getContent,
  getComments,
  getContentBySpan,
  getLikeStatus,
  getMacbeaseContribution,
  addToContentTeam,
  readContentTeam,
  removeFromTeam,
  getPopularComments,
  likeAComment,
  unLikeAComment,
  getBatchedContent,
  getDateWiseContent,
  tagSearchContent,
  editContent,
  replyToComment,
  getContentTeamAdmins,
} from '../controllers/macbeaseContentControler/macbeaseContent.controller';

const router: Router = Router();

router.get('/', getContent);
router.get('/comments', getComments);
router.get('/content-by-span', getContentBySpan);
router.get('/like-status', getLikeStatus);
router.get('/contributions', getMacbeaseContribution);
router.get('/content-team', readContentTeam);
router.get('/comments/popular', getPopularComments);
router.get('/batched-content', getBatchedContent);
router.get('/date-wise-content', getDateWiseContent);
router.get('/tag-search-content', tagSearchContent);
router.get('/team-admins', getContentTeamAdmins);
router.post('/', createContent);
router.post('/like', likeContent);
router.post('/comments', comment);
router.post('/comment/reply', replyToComment);
router.patch('/add-to-content-team', addToContentTeam);
router.patch('/remove-from-team', removeFromTeam);
router.patch('/comment/like', likeAComment);
router.patch('/edit-content', editContent);
router.delete('/comment/unlike', unLikeAComment);
router.delete('/unlike', unlikeContent);
router.delete('/delete', deleteContent);

export default router;
