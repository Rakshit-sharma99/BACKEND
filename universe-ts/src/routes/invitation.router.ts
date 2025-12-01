import { Router } from 'express';
import {
  createInvitation,
  getInvitationInfo,
  declineInvitation,
  endorseInvitation,
  acceptInvitation,
  getPendingCreatorApplications,
} from '../controllers/invitation.controller';

const router: Router = Router();

router.get('/info', getInvitationInfo);
router.get('/applications/pending', getPendingCreatorApplications);
router.post('/', createInvitation);
router.patch('/accept', acceptInvitation);
router.patch('/decline', declineInvitation);
router.patch('/endorse', endorseInvitation);

export default router;
