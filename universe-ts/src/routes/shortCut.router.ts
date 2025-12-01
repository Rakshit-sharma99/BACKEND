import { Router } from 'express';
import {
  addToShortCut,
  removeFromShortCut,
  readShortCuts,
  simpleSocialSearch,
  getRefreshedShortCuts,
} from '../controllers/shortCut.controller';

const router: Router = Router();

router.get('/read', readShortCuts);
router.get('/social-search', simpleSocialSearch);
router.get('/refresh', getRefreshedShortCuts);
router.post('/add', addToShortCut);
router.delete('/:id', removeFromShortCut);

export default router;
