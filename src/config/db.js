import mongoose from 'mongoose';

export async function connectDB() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) throw new Error('Missing MONGO_URI in .env');

  mongoose.set('strictQuery', true);
  await mongoose.connect(mongoUri);
  console.log('✅ MongoDB connected');
}
