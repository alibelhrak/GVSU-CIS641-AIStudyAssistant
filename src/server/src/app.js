import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import taskRoutes from './routes/tasks.js';
import sessionRoutes from './routes/sessions.js';
import logRoutes from './routes/logs.js';
import materialRoutes from './routes/materials.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRoutes);

  // Everything below needs a valid login token
  app.use('/api', requireAuth);
  app.use('/api/courses', courseRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/logs', logRoutes);
  app.use('/api/materials', materialRoutes);
  // These two must stay LAST
  app.use(notFound);
  app.use(errorHandler);
  return app;
}