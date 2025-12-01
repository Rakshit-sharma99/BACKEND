const express = require('express');
const router = express.Router();

const {
  createProject,
  addInterestedUser,
  removeUserFromInterested,
  updateProjectState,
  allotUsersToProject,
  submitProjectReview,
  getOpenProjects,
  getInterestedCreators,
  getAllotedCreators,
  getAllotedProjects,
  reviewProject,
  fetchProjectsBatch,
  getProjectsAllotedToUser,
  getProjectContents,
  allotChatroom,
  fetchProjectById,
  newProjectChatMessage
} = require('../controllers/projectControllers');

router.post('/createProject', createProject);
router.post('/addInterestedUser', addInterestedUser);
router.post('/removeUserFromInterested', removeUserFromInterested);
router.post('/updateProjectState', updateProjectState);
router.post('/allotUsersToProject', allotUsersToProject);
router.post('/submitProjectReview', submitProjectReview);
router.get('/getOpenProjects', getOpenProjects);
router.get('/getInterestedCreators', getInterestedCreators);
router.get('/getAllotedProjects', getAllotedProjects);
router.get('/getAllotedCreators', getAllotedCreators);
router.post('/reviewProject', reviewProject);
router.get('/fetchProjectsBatch', fetchProjectsBatch);
router.get('/getProjectsAllotedToUser', getProjectsAllotedToUser);
router.get('/getProjectContents', getProjectContents);
router.post("/allotChatroom",allotChatroom);
router.get("/fetchProjectById",fetchProjectById);
router.post("/newProjectChatMessage",newProjectChatMessage);

module.exports = router;
