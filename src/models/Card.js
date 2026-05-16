import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    packageId: { type: mongoose.Schema.Types.ObjectId, ref: 'Package', required: true, index: true },
    sideDocId: { type: String, required: true },
    localId: { type: String, default: '' },
    side: { type: String, enum: ['front', 'back', 'unknown'], default: 'unknown' },
    data: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true, minimize: false }
);

cardSchema.index({ userId: 1, packageId: 1, sideDocId: 1 }, { unique: true });
cardSchema.index({ userId: 1, packageId: 1, updatedAt: 1 });

cardSchema.methods.toClient = function toClient() {
  return {
    id: this.sideDocId,
    ...this.data,
    userId: this.userId.toString(),
    packageId: this.packageId.toString(),
    localId: this.localId,
    side: this.side,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Card', cardSchema);
