import { Router } from 'express';
import {
  createEvent,
  deleteEvent,
  getAllEvents,
  changeEventStatus,
  addClubEvent,
  getTicketsBought,
  getEventAnalytics,
  getCustomAnalytics,
  addPredefinedQues,
  removePredefinedQues,
  askQuestion,
  answerTheQuestion,
  getFaq,
  changeStatusJob,
  getTickets,
  generateTicketListPdf,
  getReviews,
  checkTicketAvailability,
  checkLiveAttendance,
  askForReviewSubmission,
  getAllTicketsBought,
  getEvents,
  checkEventStatus,
  getEventById,
  clearEventFeed,
} from '../controllers/event.controller';

const router: Router = Router();

router.get('/', getEvents);
router.get('/:id', getEventById);
router.get('/all', getAllEvents);
router.get('/tickets', getTicketsBought);
router.get('/analytics', getEventAnalytics);
router.get('/analytics/custom', getCustomAnalytics);
router.get('/faq', getFaq);
router.get('/tickets', getTickets);
router.get('/generate-ticket-listPdf', generateTicketListPdf);
router.get('/reviews', getReviews);
router.get('/ticket-availability', checkTicketAvailability);
router.get('/live-attendance', checkLiveAttendance);
router.get('/tickets/all', getAllTicketsBought);
router.get('/status', checkEventStatus);
router.post('/', createEvent);
router.post('/club', addClubEvent);
router.post('/ask-question', askQuestion);
router.patch('/predefined-ques', addPredefinedQues);
router.patch('/answer-the-question', answerTheQuestion);
router.patch('/status', changeEventStatus);
router.patch('/job/status', changeStatusJob);
router.patch('/ask-for-review-submission', askForReviewSubmission);
router.delete('/feed', clearEventFeed);
router.delete('/', deleteEvent);
router.delete('/predefined-ques', removePredefinedQues);

export default router;
