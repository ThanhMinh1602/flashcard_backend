import mongoose from 'mongoose';

const backgroundSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      default: '',
      trim: true,
    },
    url: {
      type: String,
      default: '',
    },
    publicId: {
      type: String,
      default: '',
      index: true,
    },
    frontUrl: {
      type: String,
      default: '',
    },
    backUrl: {
      type: String,
      default: '',
    },
    frontPublicId: {
      type: String,
      default: '',
      index: true,
    },
    backPublicId: {
      type: String,
      default: '',
      index: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

backgroundSchema.index({ createdAt: -1 });

backgroundSchema.methods.toClient = function toClient() {
  const frontUrl = this.frontUrl || this.url;
  const backUrl = this.backUrl || this.url;
  const frontPublicId = this.frontPublicId || this.publicId;
  const backPublicId = this.backPublicId || this.publicId;

  return {
    id: this._id.toString(),
    name: this.name,
    url: frontUrl,
    publicId: frontPublicId,
    frontUrl,
    backUrl,
    frontPublicId,
    backPublicId,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Background', backgroundSchema);
