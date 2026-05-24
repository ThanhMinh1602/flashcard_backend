import { Router } from 'express';
import {
  deleteBackground,
  getBackgrounds,
  updateBackground,
  uploadBackground,
} from '../controllers/background.controller.js';
import { adminRequired, authRequired } from '../middlewares/auth.js';
import { upload } from '../middlewares/upload.js';

const router = Router();

router.get('/', authRequired, getBackgrounds);
router.post(
  '/',
  authRequired,
  adminRequired,
  upload.fields([
    { name: 'frontBackground', maxCount: 1 },
    { name: 'backBackground', maxCount: 1 },
  ]),
  uploadBackground,
);
router.put(
  '/:backgroundId',
  authRequired,
  adminRequired,
  upload.fields([
    { name: 'frontBackground', maxCount: 1 },
    { name: 'backBackground', maxCount: 1 },
  ]),
  updateBackground,
);
router.delete('/:backgroundId', authRequired, adminRequired, deleteBackground);

export default router;
