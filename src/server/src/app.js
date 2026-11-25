import express from 'express';
import cors from 'cors';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Simple route to check the server is running
  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);

  // These two must stay LAST: unknown addresses -> 404, any error -> JSON message
  app.use(notFound);
  app.use(errorHandler);
  return app;
}