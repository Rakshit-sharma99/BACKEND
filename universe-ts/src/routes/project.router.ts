import { Router } from 'express';
import {
  createProject,
  addInterestedUser,
  removeUserFromInterested,
  updateProjectState,
  allotChatroom,
  fetchProjectById,
  allotUsersToProject,
  submitProjectReview,
  getAllotedCreators,
  getOpenProjects,
  getInterestedCreators,
  getAllotedProjects,
  reviewProject,
  fetchProjectsBatch,
  getProjectContents,
  getProjectsAllotedToUser,
  newProjectChatMessage,
} from '../controllers/project.controller';

const router: Router = Router();

router.get('/open', getOpenProjects);
router.get('/interested-creators', getInterestedCreators);
router.get('/alloted-projects', getAllotedProjects);
router.get('/alloted-creators', getAllotedCreators);
router.get('/batch', fetchProjectsBatch);
router.get('/alloted-to-user', getProjectsAllotedToUser);
router.get('/contents', getProjectContents);
router.get('/:id', fetchProjectById);
router.post('/', createProject);
router.post('/interested-user', addInterestedUser);
router.post('/allot-chatroom', allotChatroom);
router.post('/new-project-chat-message', newProjectChatMessage);
router.put('/review', submitProjectReview);
router.put('/remove-user-from-interested', removeUserFromInterested);
router.patch('/state', updateProjectState);
router.patch('/allot-users-to-project', allotUsersToProject);
router.patch('/review', reviewProject);

export default router;
