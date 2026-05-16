import mongoose from 'mongoose';

const cardSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },

    packageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Package',
      required: true,
      index: true,
    },

    // ID chung của 1 cặp thẻ.
    // Ví dụ: localId = "1715830000000"
    localId: {
      type: String,
      required: true,
      index: true,
    },

    // Giữ sideDocId để tránh lỗi với index cũ nếu trước đó DB đã tạo index:
    // userId + packageId + sideDocId.
    // Nhưng hiện tại mỗi cặp chỉ có 1 doc, nên sideDocId sẽ là `${localId}_pair`.
    sideDocId: {
      type: String,
      required: true,
    },

    // Mặt trước của thẻ.
    front: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },

    // Mặt sau của thẻ.
    back: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
    minimize: false,
  },
);

// Không dùng unique localId để tránh lỗi nếu DB cũ còn dữ liệu tách front/back.
// Query vẫn dùng userId + packageId + localId.
cardSchema.index({ userId: 1, packageId: 1, localId: 1 });
cardSchema.index({ userId: 1, packageId: 1, sideDocId: 1 }, { unique: true });
cardSchema.index({ userId: 1, packageId: 1, updatedAt: 1 });

cardSchema.methods.toPairClient = function toPairClient() {
  return {
    id: this.localId,
    localId: this.localId,
    userId: this.userId.toString(),
    packageId: this.packageId.toString(),
    front: this.front || {},
    back: this.back || {},
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

cardSchema.methods.toSideClient = function toSideClient(side) {
  const data = side === 'back' ? this.back || {} : this.front || {};

  return {
    id: `${this.localId}_${side}`,
    ...data,
    userId: this.userId.toString(),
    packageId: this.packageId.toString(),
    localId: this.localId,
    side,
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

export default mongoose.model('Card', cardSchema);
