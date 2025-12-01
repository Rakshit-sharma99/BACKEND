import { Router } from 'express';
import {
  loginUser,
  registerUser,
  googleLogin,
  googleRegister,
  recoveryEmail,
  setOtp,
  setNewPassword,
  pushToken,
  userNameAvailable,
  emailVerification,
  regenerateAccessToken,
  generateAbout,
  generateResearchAreas,
  generateInterest,
  reactivateAccount,
} from '../controllers/Auth/userAuth.controller';

const router: Router = Router();

router.get('/generate-about', generateAbout);
router.get('/generate-research-areas', generateResearchAreas);
router.get('/generate-interest', generateInterest);
router.get('/availability', userNameAvailable);
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/register/google', googleRegister);
router.post('/login/google', googleLogin);
router.post('/send-recovery-email', recoveryEmail);
router.post('/set-otp', setOtp);
router.post('/set-new-password', setNewPassword);
router.post('/email-verification', emailVerification);
router.post('/regenerate-access-token-72f8c570-2a36-11ec-8d3d-0242ac130003', regenerateAccessToken);
router.post('/reactivate-account', reactivateAccount);
router.put('/push-token', pushToken);

export default router;
