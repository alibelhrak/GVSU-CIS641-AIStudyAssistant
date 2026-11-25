import fs from 'node:fs';
import mongoose from 'mongoose';
import { config } from './config.js';
import { createApp } from './app.js';

async function main() {
  fs.mkdirSync(config.uploadDir, { recursive: true });
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  createApp().listen(config.port, () => {
    console.log(`API listening on :${config.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});