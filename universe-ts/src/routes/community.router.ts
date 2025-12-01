import { Router } from 'express';
import {
  getBatchedContent,
  createCommunity,
  deleteCommunity,
  joinAsMember,
  leaveAsMember,
  uploadContent,
  deleteContent,
  flag,
  takeDown,
  updateStreak,
  likesAndPosts,
  rating,
  getAllCommunities,
  getCommunityById,
  getCommunityByTag,
  isMember,
  getContentOfACommunity,
  getCommunitiesPartOf,
  getLatestContent,
  getCommunityProfile,
  getUserProfile,
  getLikeAndFlagStatus,
  getBasicCommunityDataFromId,
  getUserContributionCover,
  getContribution,
  getAllTags,
  getLikedPosts,
  getFastFeed,
  getFastNativeFeed,
  post,
  editCommunityProfile,
  getAllContributionOfUser,
  getAllMembers,
  getAllRelatedSocialGroups,
  getOthersContributionCover,
  getMediaAndDocs,
  gotOffline,
  addToConstraintList,
  removeFromConstraintList,
  getConstraintStatus,
  updateBooleanField,
  addAdmin,
  removeAdmin,
  searchCommunityContent,
  searchCommunityFiles,
  searchCommunityMembers,
} from '../controllers/community.controller';

const router: Router = Router();

router.get('/communities', getAllCommunities);
router.get('/communities/:communityId', getCommunityById);
router.get('/communities/tag/:tag', getCommunityByTag);
router.get('/is-member', isMember);
router.get('/get-content-of-a-community', getContentOfACommunity);
router.get('/communities/part-of', getCommunitiesPartOf);
router.get('/communities/:communityId/latest-content', getLatestContent);
router.get('/communities/:communityId/profile', getCommunityProfile);
router.get('/users/:userId', getUserProfile);
router.get('/content/:contentId/status', getLikeAndFlagStatus);
router.get('/basic-data-from-id', getBasicCommunityDataFromId);
router.get('/user/contribution/cover', getUserContributionCover);
router.get('/user/contribution', getContribution);
router.get('/tags', getAllTags);
router.get('/posts/liked', getLikedPosts);
router.get('/feed/fast', getFastFeed);
router.get('/native-feed/fast', getFastNativeFeed);
router.get('/contributions/all', getAllContributionOfUser);
router.get('/members/all', getAllMembers);
router.get('/related-social-groups', getAllRelatedSocialGroups);
router.get('/content/batched', getBatchedContent);
router.get('/contributions-cover', getOthersContributionCover);
router.get('/media-docs', getMediaAndDocs);
router.patch('/offline', gotOffline);
router.get('/:communityId/constraint-status', getConstraintStatus);
router.get('/:communityId/content', searchCommunityContent);
router.get('/:communityId/members', searchCommunityMembers);
router.get('/:communityId/files', searchCommunityFiles);
router.post('/community', createCommunity);
router.delete('/delete-community', deleteCommunity);
router.post('/join-as-member', joinAsMember);
router.delete('/leave-as-member', leaveAsMember);
router.post('/upload-content', uploadContent);
router.delete('/delete-content', deleteContent);
router.patch('/flag', flag);
router.delete('/take-down', takeDown);
router.patch('/update-streak', updateStreak);
router.patch('/likes-and-posts', likesAndPosts);
router.patch('/rating', rating);
router.post('/post', post);
router.patch('/profile', editCommunityProfile);
router.patch('/constraint', addToConstraintList);
router.delete('/:communityId/constraint', removeFromConstraintList);
router.patch('/:communityId/settings', updateBooleanField);
router.post('/:communityId/admin', addAdmin);
router.delete('/:communityId/admin/:userId', removeAdmin);

export default router;
