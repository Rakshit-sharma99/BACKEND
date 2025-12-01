import { Router } from 'express';
import { createTile, deleteTile, getTiles } from '../controllers/tile.controller';

const router: Router = Router();

router.get('/', getTiles);
router.post('/', createTile);
router.delete('/:tileId', deleteTile);

export default router;
