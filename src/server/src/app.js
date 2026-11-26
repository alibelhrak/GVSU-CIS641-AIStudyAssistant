import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { requireAuth } from './middleware/auth.js';
import { notFound, errorHandler } from './middleware/error.js';
import { llmEnabled, chatEnabled } from './config.js';
import authRoutes from './routes/auth.js';
import courseRoutes from './routes/courses.js';
import taskRoutes from './routes/tasks.js';
import sessionRoutes from './routes/sessions.js';
import logRoutes from './routes/logs.js';
import materialRoutes from './routes/materials.js';
import recommendationRoutes from './routes/recommendations.js';
import chatRoutes from './routes/chat.js';
import conversationRoutes from './routes/conversations.js';
import noteRoutes from './routes/notes.js';
import folderRoutes from './routes/folders.js';
import trashRoutes from './routes/trash.js';
import reminderRoutes, { publicReminders } from './routes/reminders.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '10mb' }));   // room for pictures attached in Ask AI

  app.get('/api/health', (_req, res) => res.json({ ok: true, llm: llmEnabled(), chat: chatEnabled() }));
  app.use('/api/auth', authRoutes);
  app.use('/api/reminders', publicReminders);   // the scheduler and the email unsubscribe link (no login)

  // Everything below under /api needs a valid login token
  app.use('/api', requireAuth);
  app.use('/api/courses', courseRoutes);
  app.use('/api/tasks', taskRoutes);
  app.use('/api/sessions', sessionRoutes);
  app.use('/api/logs', logRoutes);
  app.use('/api/materials', materialRoutes);
  app.use('/api/recommendations', recommendationRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/conversations', conversationRoutes);
  app.use('/api/notes', noteRoutes);
  app.use('/api/folders', folderRoutes);
  app.use('/api/trash', trashRoutes);
  app.use('/api/reminders', reminderRoutes);

  // Online (Render): also serve the built React app from client/dist.
  // Every address that is not /api gets index.html, so React Router can show the right page.
  const dist = path.resolve(process.env.CLIENT_DIST || '../client/dist');
  if (fs.existsSync(dist)) {
    // Android app link check (Google Play): Express hides folders starting with a dot unless allowed
    app.use('/.well-known', express.static(path.join(dist, '.well-known'), { dotfiles: 'allow' }));
    app.use(express.static(dist));
    app.get(/^\/(?!api(\/|$)).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  // These two must stay LAST
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
