import { Router } from 'express';
import { verifyToken } from '../controllers/frontend.controller';

const router: Router = Router();

router.post('/verify-token', verifyToken);

export default router;
