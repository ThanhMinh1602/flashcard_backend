import { z } from 'zod';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { signAccessToken } from '../utils/jwt.js';

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const register = asyncHandler(async (req, res) => {
  const body = authSchema.parse(req.body);
  const existed = await User.findOne({ email: body.email.toLowerCase() });
  if (existed) return res.status(409).json({ success: false, message: 'Email already exists' });

  const user = await User.create(body);
  const token = signAccessToken(user);
  return created(res, { token, user: user.toClient() }, 'Register successfully');
});

export const login = asyncHandler(async (req, res) => {
  const body = authSchema.parse(req.body);
  const user = await User.findOne({ email: body.email.toLowerCase() }).select('+password');
  if (!user || !(await user.comparePassword(body.password))) {
    return res.status(401).json({ success: false, message: 'Email or password is incorrect' });
  }

  const token = signAccessToken(user);
  return ok(res, { token, user: user.toClient() }, 'Login successfully');
});

export const me = asyncHandler(async (req, res) => ok(res, { user: req.user.toClient() }));

export const forgotPassword = asyncHandler(async (req, res) => {
  // Chưa cấu hình email SMTP. API trả success để frontend không crash.
  return ok(res, null, 'If this email exists, reset instruction will be sent');
});
