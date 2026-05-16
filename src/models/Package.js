import mongoose from 'mongoose';

const packageSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    name: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    backgroundPairId: { type: String, default: '1' },
  },
  { timestamps: true }
);

packageSchema.index({ userId: 1, createdAt: -1 });

packageSchema.methods.toClient = function toClient() {
  return {
    id: this._id.toString(),
    name: this.name,
    description: this.description,
    backgroundPairId: this.backgroundPairId,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Package', packageSchema);
