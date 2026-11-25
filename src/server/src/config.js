import path from 'node:path';

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/study_assistant',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  llm: {
    baseUrl: (process.env.LLM_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || '',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 30000,
  },
};

// The LLM is on only when an address and a model name are set
export const llmEnabled = () => Boolean(config.llm.baseUrl && config.llm.model);