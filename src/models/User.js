import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 6,
      select: false,
    },

    resetPasswordOtp: {
      type: String,
      select: false,
    },

    resetPasswordOtpExpires: {
      type: Date,
      select: false,
    },

    resetPasswordOtpVerified: {
      type: Boolean,
      default: false,
      select: false,
    },
  },
  { timestamps: true },
);

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) return next();

  this.password = await bcrypt.hash(this.password, 12);

  if (this.isModified('password')) {
    this.resetPasswordOtp = undefined;
    this.resetPasswordOtpExpires = undefined;
    this.resetPasswordOtpVerified = false;
  }

  next();
});

userSchema.methods.comparePassword = function comparePassword(password) {
  return bcrypt.compare(password, this.password);
};

userSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    uid: this._id.toString(),
    email: this.email,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('User', userSchema);
