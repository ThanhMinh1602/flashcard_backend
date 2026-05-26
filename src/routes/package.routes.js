import { Router } from 'express';
import multer from 'multer';
import {
  createPackage,
  deletePackage,
  getDeletedPackages,
  getPackages,
  importTempHsk4Packages,
  permanentlyDeletePackage,
  restorePackage,
  updatePackage,
  updatePackageBackground,
} from '../controllers/package.controller.js';
import { authRequired } from '../middlewares/auth.js';

const router = Router();
router.use(authRequired);

const tempImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 80 * 1024 * 1024,
    files: 5,
  },
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype === 'application/json' ||
      file.originalname?.toLowerCase().endsWith('.json')
    ) {
      return cb(null, true);
    }

    return cb(new Error('Only JSON files are allowed'));
  },
});

/**
 * @swagger
 * /api/packages:
 *   get:
 *     tags: [Packages]
 *     security: [{ bearerAuth: [] }]
 *     summary: Get packages of current user
 *     responses:
 *       200: { description: Success }
 *   post:
 *     tags: [Packages]
 *     security: [{ bearerAuth: [] }]
 *     summary: Create package
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "English Vocabulary" }
 *               description: { type: string, example: "Toefl preparation words" }
 *     responses:
 *       201: { description: Created }
 */
router.route('/').get(getPackages).post(createPackage);

router.get('/trash', getDeletedPackages);
router.post('/temp-import/hsk4', tempImportUpload.array('packages', 5), importTempHsk4Packages);
router.patch('/:packageId/restore', restorePackage);
router.delete('/:packageId/permanent', permanentlyDeletePackage);

/**
 * @swagger
 * /api/packages/{packageId}:
 *   put:
 *     tags: [Packages]
 *     security: [{ bearerAuth: [] }]
 *     summary: Update package
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string, example: "English Vocabulary V2" }
 *               description: { type: string, example: "Updated description" }
 *     responses:
 *       200: { description: Updated }
 *       404: { description: Package not found }
 *   delete:
 *     tags: [Packages]
 *     security: [{ bearerAuth: [] }]
 *     summary: Delete package and cards
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Package deleted }
 *       404: { description: Package not found }
 */
router.route('/:packageId').put(updatePackage).delete(deletePackage);

/**
 * @swagger
 * /api/packages/{packageId}/background:
 *   patch:
 *     tags: [Packages]
 *     security: [{ bearerAuth: [] }]
 *     summary: Update package background
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               backgroundPairId: { type: string, example: "2" }
 *     responses:
 *       200: { description: Background updated }
 *       404: { description: Package not found }
 */
router.patch('/:packageId/background', updatePackageBackground);

export default router;
