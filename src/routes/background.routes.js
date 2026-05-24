import { Router } from 'express';
import {
  getBackgrounds,
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
  upload.single('background'),
  uploadBackground,
);

export default router;
