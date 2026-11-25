import path from 'node:path';

export const config = {
  port: Number(process.env.PORT) || 5000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/study_assistant',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  uploadDir: path.resolve(process.env.UPLOAD_DIR || './uploads'),
  // The address of the website, used in the "reset your password" email link
  appUrl: (process.env.APP_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  mail: {
    apiKey: process.env.BREVO_API_KEY || '',
    from: process.env.MAIL_FROM || '',
    fromName: process.env.MAIL_FROM_NAME || 'Study Assistant',
  },
  llm: {
    baseUrl: (process.env.LLM_BASE_URL || '').replace(/\/+$/, ''),
    apiKey: process.env.LLM_API_KEY || '',
    model: process.env.LLM_MODEL || '',
    // The chat can use a different (bigger) model than the recommendation text. Defaults to LLM_MODEL.
    chatModel: process.env.CHAT_MODEL || process.env.LLM_MODEL || '',
    // A model that can read images, used only when the student attaches a picture (Groq: qwen/qwen3.8-27b)
    visionModel: process.env.VISION_MODEL || '',
    timeoutMs: Number(process.env.LLM_TIMEOUT_MS) || 30000,
  },
};

// The LLM is on only when an address and a model name are set
export const llmEnabled = () => Boolean(config.llm.baseUrl && config.llm.model);
export const chatEnabled = () => Boolean(config.llm.baseUrl && config.llm.chatModel);
// Emails are sent only when a Brevo key and a sender address are set
export const mailEnabled = () => Boolean(config.mail.apiKey && config.mail.from);
