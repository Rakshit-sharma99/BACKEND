const express = require('express');
const router = express.Router();

const {
  submitForReview,
  readContentForModeration,
  discardReviewClaim,
  addDiscretion,
} = require('../controllers/contentModeration');

router.post('/submitForReview', submitForReview);
router.get('/readContentForModeration', readContentForModeration);
router.post('/discardReviewClaim', discardReviewClaim);
router.post('/addDiscretion', addDiscretion);

module.exports = router;
