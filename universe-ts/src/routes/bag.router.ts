import { Router } from 'express';
import {
  createBag,
  searchBags,
  getAllKeywords,
  unsortedTag,
  getUnsortedTags,
  sortATag,
  getKeysFromBag,
  deleteKeyFromBag,
  deleteBag,
  deleteUnsortedWord,
  masterSearch,
} from '../controllers/bag.controller';

const router: Router = Router();

router.get('/search', searchBags);
router.get('/all-keywords', getAllKeywords);
router.get('/master-search', masterSearch);
router.post('/', createBag);
router.get('/unsorted-tags', getUnsortedTags);
router.get('/:bagTitle/keywords', getKeysFromBag);
router.post('/unsorted-tag', unsortedTag);
router.post('/unsorted/:word', deleteUnsortedWord);
router.patch('/sort', sortATag);
router.delete('/:bagTitle/keyword/:word', deleteKeyFromBag);
router.delete('/:id', deleteBag);

export default router;
