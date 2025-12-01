const express = require('express');
const router = express.Router();

const { registerProp, deleteProp, delayedProps, returnProps, decommissionProp, propsStatistics, decommissionedProps, recommissionProp, dispatchProp, userPropReview, shiftArray, findAvailableProp, placeOrder, getPropOrder, nightBookingAvailability, placeNightOrder, getPropsOnField, pumpUpCreditScore, timeOfReturn, getStats, getCreditScore, createNewPropType, getAllTypesOfProp, deleteTypeOfProp, updatePropType, likeAProp, getDynamicPrice, getReviews, checkExtension, placeOrderForExtension, getDayDelayed, getNightDelay } = require('../controllers/propsControllers');

router.post('/registerProp', registerProp);
router.post('/deleteProp', deleteProp);
router.post('/findAvailableProp', findAvailableProp);
router.post('/placeOrder', placeOrder);
router.post('/dispatchProp', dispatchProp);
router.post('/returnProps', returnProps);
router.post('/userPropReview', userPropReview);
router.get('/getPropOrder', getPropOrder);
router.post('/nightBookingAvailability', nightBookingAvailability);
router.post('/placeNightOrder', placeNightOrder);
router.post('/decommissionProp', decommissionProp);
router.post('/recommissionProp', recommissionProp);
router.post('/shiftArray', shiftArray);
router.get('/delayedProps', delayedProps);
router.get('/propsStatistics', propsStatistics);
router.get('/decommissionedProps', decommissionedProps);
router.get('/getPropsOnField', getPropsOnField);
router.post('/pumpUpCreditScore', pumpUpCreditScore);
router.post('/timeOfReturn', timeOfReturn);
router.post('/getStats', getStats);
router.get('/getCreditScore', getCreditScore);
router.post('/createNewPropType', createNewPropType);
router.get('/getAllTypesOfProp', getAllTypesOfProp);
router.get('/deleteTypeOfProp', deleteTypeOfProp);
router.post('/updatePropType', updatePropType);
router.get('/likeAProp', likeAProp);
router.get('/getDynamicPrice', getDynamicPrice);
router.get('/getReviews', getReviews);
router.get('/checkExtension', checkExtension);
router.get('/placeOrderForExtension', placeOrderForExtension);
router.get('/getDayDelayed', getDayDelayed);
router.get('/getNightDelay', getNightDelay);

module.exports = router;