import { Router } from 'express';
import {
  createClub,
  deleteClub,
  joinAsMember,
  leaveAsMember,
  addAsMember,
  removeAsMember,
  addAdmin,
  removeAdmin,
  addNotifications,
  deleteNotifications,
  getAllEvents,
  getClub,
  getAllClub,
  postEvent,
  removeEvent,
  postContent,
  removeContent,
  postGallery,
  removeGallery,
  editProfile,
  addTeamMember,
  removeTeamMember,
  getClubsByTag,
  getLikeStatus,
  getLatestContent,
  getClubsPartOf,
  getClubProfile,
  updateRating,
  getClubBio,
  getClubContent,
  getClubGallery,
  getClubVideos,
  isAdmin,
  isMember,
  getClubNotifications,
  isMainAdmin,
  getCreatorId,
  getFastFeed,
  getStatus,
  getFastNativeFeed,
  getAllLikedPins,
  getSimilarGroups,
  getEveryoneOfClub,
  getAllContent,
  getPushTokenChunk,
  changeLeader,
  getClubContributions,
  addProposal,
  fetchProposals,
  changeProposalStatus,
  searchClubProposals,
  searchClubContent,
  searchClubEvent,
  searchClubFiles,
  searchClubMembers,
  getClubContentByMonth,
  nullifyClubDynamicIsland,
  newClubMessage,
  clubsWithPostingRights,
} from '../controllers/club.controller';

const router: Router = Router();

router.get('/', getClub);
router.get('/all', getAllClub);
router.get('/events', getAllEvents);
router.get('/tag', getClubsByTag);
router.get('/content', getClubContent);
router.get('/content/like-status', getLikeStatus);
router.get('/content/latest', getLatestContent);
router.get('/user/clubs', getClubsPartOf);
router.get('/profile', getClubProfile);
router.get('/bio', getClubBio);
router.get('/gallery', getClubGallery);
router.get('/videos', getClubVideos);
router.get('/is-admin', isAdmin);
router.get('/is-member', isMember);
router.get('/notifications', getClubNotifications);
router.get('/main-admin', isMainAdmin);
router.get('/creator-id', getCreatorId);
router.get('/feed/fast', getFastFeed);
router.get('/status', getStatus);
router.get('/feed/native/fast', getFastNativeFeed);
router.get('/pins/liked', getAllLikedPins);
router.get('/groups/similar', getSimilarGroups);
router.get('/everyone', getEveryoneOfClub);
router.get('/content/all', getAllContent);
router.get('/push-tokens-chunk', getPushTokenChunk);
router.get('/contributions', getClubContributions);
router.get('/proposal', fetchProposals);
router.get('/proposals/search', searchClubProposals);
router.get('/nullify-club-dynamic-island', nullifyClubDynamicIsland);
router.get('/posting-rights', clubsWithPostingRights);
router.get('/members/search', searchClubMembers);
router.get('/content/search', searchClubContent);
router.get('/files', searchClubFiles);
router.get('/event/search', searchClubEvent);
router.get('/content/month', getClubContentByMonth);
router.post('/', createClub);
router.post('/add-member', addAsMember);
router.post('/admin', addAdmin);
router.post('/notifications', addNotifications);
router.post('/event', postEvent);
router.post('/content', postContent);
router.post('/gallery', postGallery);
router.post('/team', addTeamMember);
router.post('/proposal', addProposal);
router.post('/:clubId/message', newClubMessage);
router.put('/join', joinAsMember);
router.patch('/change-leader', changeLeader);
router.patch('/:clubId', editProfile);
router.patch('/proposal/status', changeProposalStatus);
router.patch('/rating', updateRating);
router.delete('/:clubId', deleteClub);
router.delete('/leave', leaveAsMember);
router.delete('/member', removeAsMember);
router.delete('/admin', removeAdmin);
router.delete('/event', removeEvent);
router.delete('/content', removeContent);
router.delete('/gallery', removeGallery);
router.delete('/team', removeTeamMember);
router.delete('/notifications/:uid', deleteNotifications);

export default router;
