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
  // Where reports of shared pages and chat messages are emailed (default: MAIL_FROM)
  reportEmail: process.env.REPORT_EMAIL || process.env.MAIL_FROM || '',
  // Zoom (a "General app, user-managed" on marketplace.zoom.us): lets students start group meetings
  zoom: {
    clientId: process.env.ZOOM_CLIENT_ID || '',
    clientSecret: process.env.ZOOM_CLIENT_SECRET || '',
    webhookSecret: process.env.ZOOM_WEBHOOK_SECRET || '',     // "Secret Token" for the deauthorization event
    oauthUrl: (process.env.ZOOM_OAUTH_URL || 'https://zoom.us').replace(/\/+$/, ''),
    apiUrl: (process.env.ZOOM_API_URL || 'https://api.zoom.us/v2').replace(/\/+$/, ''),
  },
  // Push notifications (create the keys once with: npx web-push generate-vapid-keys)
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || `mailto:${process.env.MAIL_FROM || 'admin@example.com'}`,
  },
  // A password that the scheduler (GitHub Actions) sends to POST /api/reminders/run
  cronSecret: process.env.CRON_SECRET || '',
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
export const pushEnabled = () => Boolean(config.push.publicKey && config.push.privateKey);
export const zoomEnabled = () => Boolean(config.zoom.clientId && config.zoom.clientSecret);
