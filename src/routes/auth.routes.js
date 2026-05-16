import { Router } from 'express';
import {
  forgotPassword,
  login,
  me,
  register,
} from '../controllers/auth.controller.js';
import { authRequired } from '../middlewares/auth.js';

const router = Router();

/**
 * @swagger
 * /api/auth/register:
 *   post:
 *     tags: [Auth]
 *     summary: Register account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "user@gmail.com" }
 *               password: { type: string, example: "123456" }
 *     responses:
 *       201: { description: Registered successfully }
 *       409: { description: Email already exists }
 */
router.post('/register', register);

/**
 * @swagger
 * /api/auth/login:
 *   post:
 *     tags: [Auth]
 *     summary: Login account
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email: { type: string, example: "user@gmail.com" }
 *               password: { type: string, example: "123456" }
 *     responses:
 *       200: { description: Login successfully }
 *       401: { description: Email or password is incorrect }
 */
router.post('/login', login);

/**
 * @swagger
 * /api/auth/me:
 *   get:
 *     tags: [Auth]
 *     security: [{ bearerAuth: [] }]
 *     summary: Get current user
 *     responses:
 *       200: { description: Success }
 */
router.get('/me', authRequired, me);

/**
 * @swagger
 * /api/auth/forgot-password:
 *   post:
 *     tags: [Auth]
 *     summary: Forgot password
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email: { type: string, example: "user@gmail.com" }
 *     responses:
 *       200: { description: If this email exists, reset instruction will be sent }
 */
router.post('/forgot-password', forgotPassword);

export default router;
