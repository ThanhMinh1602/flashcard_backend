import { Router } from 'express';
import {
  bulkSaveCards,
  deleteFlashcardPair,
  getFlashcardPair,
  getFlashcardSummaries,
  getFlashcards,
  reorderFlashcards,
  saveCardSide,
} from '../controllers/card.controller.js';
import { authRequired } from '../middlewares/auth.js';

const router = Router({
  mergeParams: true,
});

router.use(authRequired);

/**
 * @swagger
 * /api/packages/{packageId}/cards:
 *   get:
 *     tags: [Cards]
 *     security: [{ bearerAuth: [] }]
 *     summary: Get cards in package
 *     description: Returns card sides for frontend compatibility, but MongoDB stores each front/back pair in one document.
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của package
 *     responses:
 *       200:
 *         description: Lấy danh sách thẻ thành công
 *       404:
 *         description: Không tìm thấy package
 */
router.get('/', getFlashcards);
router.get('/summary', getFlashcardSummaries);
router.get('/pair/:localId', getFlashcardPair);
router.patch('/reorder', reorderFlashcards);

/**
 * @swagger
 * /api/packages/{packageId}/cards/bulk:
 *   put:
 *     tags: [Cards]
 *     security: [{ bearerAuth: [] }]
 *     summary: Save many card pairs
 *     description: Saves only changed cards in one request. Each item contains localId, front and back.
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của package
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               cards:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     localId:
 *                       type: string
 *                     front:
 *                       type: object
 *                     back:
 *                       type: object
 *     responses:
 *       200:
 *         description: Lưu danh sách thẻ thành công
 *       404:
 *         description: Không tìm thấy package
 */
router.put('/bulk', bulkSaveCards);

/**
 * @swagger
 * /api/packages/{packageId}/cards/{sideDocId}:
 *   put:
 *     tags: [Cards]
 *     security: [{ bearerAuth: [] }]
 *     summary: Save one card side into one pair document
 *     description: sideDocId should be localId_front or localId_back. Backend stores both sides in one MongoDB document.
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của package
 *       - in: path
 *         name: sideDocId
 *         required: true
 *         schema:
 *           type: string
 *         description: Định dạng localId_front hoặc localId_back
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Dữ liệu của thẻ front hoặc back
 *     responses:
 *       200:
 *         description: Lưu thẻ thành công
 *       404:
 *         description: Không tìm thấy package
 */
router.put('/:sideDocId', saveCardSide);

/**
 * @swagger
 * /api/packages/{packageId}/cards/pair/{localId}:
 *   delete:
 *     tags: [Cards]
 *     security: [{ bearerAuth: [] }]
 *     summary: Delete one flashcard pair by localId
 *     parameters:
 *       - in: path
 *         name: packageId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID của package
 *       - in: path
 *         name: localId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID chung của cặp thẻ, ví dụ 1715830000000
 *     responses:
 *       200:
 *         description: Xóa cặp thẻ thành công
 *       404:
 *         description: Không tìm thấy package
 */
router.delete('/pair/:localId', deleteFlashcardPair);

export default router;
