import { Router } from 'express';
import {
  deleteFlashcardPair,
  getFlashcards,
  saveCardSide,
} from '../controllers/card.controller.js';
import { authRequired } from '../middlewares/auth.js';

const router = Router({ mergeParams: true });
router.use(authRequired);

/**
 * @swagger
 * /api/packages/{packageId}/cards:
 *   get:
 *     tags: [Cards]
 *     security: [{ bearerAuth: [] }]
 *     summary: Get cards in package
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Success }
 *       404: { description: Package not found }
 */
router.get('/', getFlashcards);

/**
 * @swagger
 * /api/packages/{packageId}/cards/{sideDocId}:
 *   put:
 *     tags: [Cards]
 *     security: [{ bearerAuth: [] }]
 *     summary: Save one card side (e.g. localId_front or localId_back)
 *     description: Mọi dữ liệu gửi trong body sẽ được lưu vào trường `data` của thẻ (tự động loại bỏ userId, packageId, createdAt, updatedAt).
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: sideDocId
 *         required: true
 *         schema: { type: string }
 *         description: Format thường là "id_front" hoặc "id_back"
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               content: { type: string, example: "Hello" }
 *               type: { type: string, example: "text" }
 *               color: { type: string, example: "#000000" }
 *     responses:
 *       200: { description: Card saved }
 *       404: { description: Package not found }
 */
router.put('/:sideDocId', saveCardSide);

/**
 * @swagger
 * /api/packages/{packageId}/cards/pair/{localId}:
 *   delete:
 *     tags: [Cards]
 *     security: [{ bearerAuth: [] }]
 *     summary: Delete front and back by localId
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: localId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200: { description: Card pair deleted }
 *       404: { description: Package not found }
 */
router.delete('/pair/:localId', deleteFlashcardPair);

export default router;
