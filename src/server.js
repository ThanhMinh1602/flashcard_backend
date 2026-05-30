import dotenv from 'dotenv';
import app from './app.js';
import { connectDB } from './config/db.js';

dotenv.config();

const port = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(port, () => {
      console.log(`🚀 API running: http://localhost:${port}`);
      console.log(`📚 Swagger: http://localhost:${port}/api-docs`);
    });
  })
  .catch((error) => {
    console.error('❌ Cannot start server:', error);
    process.exit(1);
  });
