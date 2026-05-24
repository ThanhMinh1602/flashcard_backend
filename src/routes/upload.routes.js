import { Router } from 'express';
import {
  deleteCardImage,
  uploadCardImage,
} from '../controllers/upload.controller.js';
import { authRequired } from '../middlewares/auth.js';
import { uploadImage } from '../middlewares/upload.js';

const router = Router();

router.use(authRequired);

router.post('/image', uploadImage.single('image'), uploadCardImage);
router.delete('/image', deleteCardImage);

export default router;
