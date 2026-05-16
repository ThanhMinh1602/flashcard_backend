import bcrypt from 'bcryptjs';
import { z } from 'zod';
import User from '../models/User.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { created, ok } from '../utils/response.js';
import { signAccessToken } from '../utils/jwt.js';
import { sendMail } from '../utils/mail.js';
import { otpMailTemplate } from '../utils/otpMailTemplate.js';

const authSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const verifyOtpSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

const resetPasswordSchema = z.object({
  email: z.string().email(),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
});

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export const register = asyncHandler(async (req, res) => {
  const body = authSchema.parse(req.body);

  const existed = await User.findOne({
    email: body.email.toLowerCase(),
  });

  if (existed) {
    return res.status(409).json({
      success: false,
      message: 'Email already exists',
    });
  }

  const user = await User.create({
    email: body.email.toLowerCase(),
    password: body.password,
  });

  const token = signAccessToken(user);

  return created(
    res,
    {
      token,
      user: user.toClient(),
    },
    'Register successfully',
  );
});

export const login = asyncHandler(async (req, res) => {
  const body = authSchema.parse(req.body);

  const user = await User.findOne({
    email: body.email.toLowerCase(),
  }).select('+password');

  if (!user || !(await user.comparePassword(body.password))) {
    return res.status(401).json({
      success: false,
      message: 'Email or password is incorrect',
    });
  }

  const token = signAccessToken(user);

  return ok(
    res,
    {
      token,
      user: user.toClient(),
    },
    'Login successfully',
  );
});

export const me = asyncHandler(async (req, res) => {
  return ok(res, {
    user: req.user.toClient(),
  });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = forgotPasswordSchema.parse(req.body);
  const normalizedEmail = email.toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select(
    '+resetPasswordOtp +resetPasswordOtpExpires +resetPasswordOtpVerified',
  );

  // Trả success kể cả email không tồn tại để tránh lộ email đã đăng ký.
  if (!user) {
    return ok(
      res,
      null,
      'If this email exists, OTP has been sent to your Gmail',
    );
  }

  const otp = generateOtp();
  const expiresMinutes = Number(process.env.OTP_EXPIRES_MINUTES || 5);

  user.resetPasswordOtp = await bcrypt.hash(otp, 12);
  user.resetPasswordOtpExpires = new Date(
    Date.now() + expiresMinutes * 60 * 1000,
  );
  user.resetPasswordOtpVerified = false;

  await user.save({ validateBeforeSave: false });

  await sendMail({
    to: normalizedEmail,
    subject: 'Mã OTP đặt lại mật khẩu Plashcard',
    html: otpMailTemplate({
      otp,
      minutes: expiresMinutes,
    }),
  });

  return ok(res, null, 'If this email exists, OTP has been sent to your Gmail');
});

export const verifyResetOtp = asyncHandler(async (req, res) => {
  const { email, otp } = verifyOtpSchema.parse(req.body);
  const normalizedEmail = email.toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select(
    '+resetPasswordOtp +resetPasswordOtpExpires +resetPasswordOtpVerified',
  );

  if (
    !user ||
    !user.resetPasswordOtp ||
    !user.resetPasswordOtpExpires ||
    user.resetPasswordOtpExpires < new Date()
  ) {
    return res.status(400).json({
      success: false,
      message: 'OTP is invalid or expired',
    });
  }

  const isMatch = await bcrypt.compare(otp, user.resetPasswordOtp);

  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: 'OTP is invalid or expired',
    });
  }

  user.resetPasswordOtpVerified = true;
  await user.save({ validateBeforeSave: false });

  return ok(res, null, 'OTP verified successfully');
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { email, otp, newPassword } = resetPasswordSchema.parse(req.body);
  const normalizedEmail = email.toLowerCase();

  const user = await User.findOne({ email: normalizedEmail }).select(
    '+password +resetPasswordOtp +resetPasswordOtpExpires +resetPasswordOtpVerified',
  );

  if (
    !user ||
    !user.resetPasswordOtp ||
    !user.resetPasswordOtpExpires ||
    user.resetPasswordOtpExpires < new Date()
  ) {
    return res.status(400).json({
      success: false,
      message: 'OTP is invalid or expired',
    });
  }

  const isMatch = await bcrypt.compare(otp, user.resetPasswordOtp);

  if (!isMatch) {
    return res.status(400).json({
      success: false,
      message: 'OTP is invalid or expired',
    });
  }

  user.password = newPassword;
  user.resetPasswordOtp = undefined;
  user.resetPasswordOtpExpires = undefined;
  user.resetPasswordOtpVerified = false;

  await user.save();

  return ok(res, null, 'Password reset successfully');
});

export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body);

  const user = await User.findById(req.user._id).select('+password');

  if (!user || !(await user.comparePassword(currentPassword))) {
    return res.status(400).json({
      success: false,
      message: 'Current password is incorrect',
    });
  }

  user.password = newPassword;
  await user.save();

  return ok(res, null, 'Password changed successfully');
});
