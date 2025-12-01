const express = require('express');
const router = express.Router();

const {
  giveAdditionalBadges,
  generateBadges,
  getUnusedBadges,
  giveBadge,
  redundant,
  insertNewFields
} = require('../controllers/badgeControllers');

router.post('/giveAdditionalBadges', giveAdditionalBadges);
router.post('/generateBadges', generateBadges);
router.get('/getUnusedBadges', getUnusedBadges);
router.post('/giveBadge', giveBadge);
// router.get('/redundant', redundant);
router.post("/insertNewFields",insertNewFields);

module.exports = router;
