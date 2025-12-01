const express = require('express');
const router = express.Router();

const {
  addToShortCut,
  removeFromShortCut,
  readShortCuts,
  simpleSocialSearch,
  getRefreshedShortCuts,
} = require('../controllers/shortCutControllers');

router.post('/addToShortCut', addToShortCut);
router.post('/removeFromShortCut', removeFromShortCut);
router.get('/readShortCuts', readShortCuts);
router.get('/simpleSocialSearch', simpleSocialSearch);
router.get('/getRefreshedShortCuts', getRefreshedShortCuts);

module.exports = router;
