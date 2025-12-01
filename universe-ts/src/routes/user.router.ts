import { Router } from 'express';
import {
  getUser,
  getUserById,
  updateUser,
  deleteUser,
  getUserByToken,
  searchUserByName,
  getUserBio,
  advanceSearch,
  getAllUsers,
  getRandomUsers,
  changePassword,
  pushPermanentNotice,
  getPermanentNotices,
  deleteNotifications,
  getCommunitiesForPost,
  getPermanentNoticeInBatch,
  sendMailToUsers,
  getBasicUserBio,
  sendNotification,
  deactivateAccount,
  cleanUp,
  search,
  fetchMultipleProfiles,
  tuneIn,
  untune,
  getProfessorRecommendations,
  searchFromAllProfessors,
  sendMailVerification,
  verifyEmail,
  completeProfile,
  getInactiveUsers,
  sendBatchedNotifications,
} from '../controllers/user.controller';

const router: Router = Router();

router.route('/').get(getUser).delete(deleteUser);

router.get('/:id', getUserById);
router.get('/user-by-token', getUserByToken);
router.get('/search-name', searchUserByName);
router.get('/bio', getUserBio);
router.get('/advance-search', advanceSearch);
router.get('/chat', getAllUsers);
router.get('/random-users', getRandomUsers);
router.get('/notices/permanent', getPermanentNotices);
router.get('/notices/permanent/batch', getPermanentNoticeInBatch);
router.get('/communities-post', getCommunitiesForPost);
router.get('/basic-user-bio', getBasicUserBio);
router.get('/cleanup', cleanUp);
router.get('/search', search);
router.get('/professors/recommendations', getProfessorRecommendations);
router.get('/professors/search', searchFromAllProfessors);
router.get('/inactive', getInactiveUsers);
router.post('/notice/push', pushPermanentNotice);
router.post('/mail/send', sendMailToUsers);
router.post('/notifications/send', sendNotification);
router.post('/fetch-profiles', fetchMultipleProfiles);
router.post('/tunein', tuneIn);
router.post('/send-mail-verification', sendMailVerification);
router.post('/verify-email', verifyEmail);
router.post('/batch', sendBatchedNotifications);
router.put('/change-password', changePassword);
router.patch('/update', updateUser);
router.patch('/complete-profile', completeProfile);
router.patch('/deactivate', deactivateAccount);
router.delete('/notifications', deleteNotifications);
router.delete('/untune', untune);

export default router;
