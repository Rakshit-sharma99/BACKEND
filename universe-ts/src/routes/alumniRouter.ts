import express from 'express';
import { getOrganizations, getAlumni, searchAlumni } from '../controllers/alumni.controller';

const router = express.Router();

router.get('/organizations', getOrganizations);
router.get('/alumni', getAlumni);
router.get('/alumni/search', searchAlumni);

export default router;
