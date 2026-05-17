import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';

import { swaggerSpec } from './docs/swagger.js';
import authRoutes from './routes/auth.routes.js';
import packageRoutes from './routes/package.routes.js';
import cardRoutes from './routes/card.routes.js';
import { errorHandler, notFound } from './middlewares/errorHandler.js';

const app = express();

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'https://flash-card-72702.web.app',
  ...(process.env.CLIENT_URL ? process.env.CLIENT_URL.split(',') : []),
].map((origin) => origin.trim()).filter(Boolean);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: false,
  }),
);

app.use(
  cors({
    origin: (origin, callback) => {

      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
  }),
);

app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(morgan('dev'));

app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 500,
  }),
);

app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'API is running',
  });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.use('/api/auth', authRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/packages/:packageId/cards', cardRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;