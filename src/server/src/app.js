import express from 'express';
import cors from 'cors';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  // Simple route to check the server is running
  app.get('/api/health', (_req, res) => res.json({ ok: true }));

  return app;
}