import { Router } from 'express';
import {
  registerAdmin,
  loginAdmin,
  regenerateAccessToken,
  setOtp,
  setNewPassword,
} from '../controllers/Auth/adminAuth.controller';

const router: Router = Router();

router.post('/register', registerAdmin);
router.post('/login', loginAdmin);
router.post('/regenerate-access-token-72f8c571-2a36-11ec-8d3d-0242ac130003', regenerateAccessToken);
router.post('/password-recovery', setOtp);
router.patch('/password-reset', setNewPassword);

export default router;
