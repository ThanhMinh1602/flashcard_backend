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
      required: true,
    },
    publicId: {
      type: String,
      required: true,
      unique: true,
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
  return {
    id: this._id.toString(),
    name: this.name,
    url: this.url,
    publicId: this.publicId,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Background', backgroundSchema);
