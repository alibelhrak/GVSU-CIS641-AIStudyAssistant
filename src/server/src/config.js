import path from 'node:path';

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/study_assistant',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
};