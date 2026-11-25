# AI Study Assistant: Developer Guide

A MERN app (MongoDB, Express, React, Node.js). See the [main README](../README.md) for an overview and the features.

## Run it

**Docker** (MongoDB, API and the app behind nginx):
```
cd src
copy .env.example .env        (macOS/Linux: cp .env.example .env)
docker compose up -d --build
```
Open http://localhost:8080.

**Node.js** (for development, with live reload):
```
cd src/server  &&  npm install  &&  npm run dev     # API on http://localhost:5000
cd src/client  &&  npm install  &&  npm run dev     # app on http://localhost:5173
```
The server reads `src/server/.env`. Vite forwards `/api` requests to port 5000.

## Settings

Put these in `src/server/.env` on your computer, or in the **Environment** tab on Render. Never commit `.env`.

| Variable | Needed? | What it does |
|---|---|---|
| `MONGO_URI` | **Yes** | MongoDB connection string (default: `mongodb://127.0.0.1:27017/study_assistant`) |
| `JWT_SECRET` | **Yes** | Long random text used to sign login tokens |
| `PORT` | No | API port (default `5000`; Render sets it itself) |
| `LLM_BASE_URL` | For AI | OpenAI-compatible API address, for example `https://api.groq.com/openai/v1` |
| `LLM_API_KEY` | For AI | The API key (Groq keys start with `gsk_`) |
| `LLM_MODEL` | For AI | Model for the recommendation text, for example `llama-3.3-70b-versatile` |
| `CHAT_MODEL` | No | A different model just for Ask AI, for example `openai/gpt-oss-120b` (default: `LLM_MODEL`) |
| `BREVO_API_KEY` | For email | Brevo API key (starts with `xkeysib-`) for password reset emails |
| `MAIL_FROM` | For email | The sender address you verified in Brevo |
| `MAIL_FROM_NAME` | No | Sender name (default `Study Assistant`) |
| `APP_URL` | For email | The site address used in reset links (default `http://localhost:5173`) |
| `UPLOAD_DIR` | No | Where uploaded files are saved (default `./uploads`) |

Without the AI settings, recommendations use rule-based text and Ask AI is turned off. Without the email settings, reset emails are printed in the server terminal instead of being sent, which is handy for testing.

`GET /api/health` shows what is turned on, for example `{"ok":true,"llm":true,"chat":true}`.

## Deploy on Render (free)

One web service runs the API and also serves the built React app.

| Setting | Value |
|---|---|
| Root Directory | `src` |
| Build Command | `cd client && npm ci && npm run build && cd ../server && npm ci --omit=dev` |
| Start Command | `cd server && npm start` |
| Environment | `MONGO_URI`, `JWT_SECRET`, `NODE_VERSION=22`, plus the AI and email settings above |

In MongoDB Atlas, allow access from anywhere (`0.0.0.0/0`), because Render's address changes. After pushing to GitHub, use **Manual Deploy → Deploy latest commit** if auto-deploy is off.

Uploaded files are saved on the server's disk. On Render's free plan that disk is wiped on every deploy or restart, so uploads there are not permanent.

## API

All routes start with `/api`. Every route except `/auth/*` and `/health` needs the header `Authorization: Bearer <token>`.

| Route | What it does |
|---|---|
| `POST /auth/register`, `POST /auth/login` | Create an account / sign in; returns a token and the user |
| `GET /auth/me` | The signed-in user |
| `POST /auth/forgot` | Emails a reset link (always gives the same answer, so it never reveals who has an account) |
| `POST /auth/reset` | Sets a new password with the code from the link and signs in |
| `/courses`, `/tasks`, `/sessions`, `/logs` | List, create (`POST`), update (`PATCH /:id`) and delete (`DELETE /:id`) |
| `/materials` | List; `POST /materials/upload` (files), `POST /materials/link`, `GET /materials/:id/file` (download), `DELETE /materials/:id` |
| `POST /recommendations/generate` | Works out the current advice and returns it |
| `POST /recommendations/:id/accept` / `dismiss` | Accept (adds the sessions) or dismiss advice |
| `POST /chat` | Ask AI: sends the conversation and streams the answer back as plain text |

## Project structure

```
src/
  docker-compose.yml       MongoDB + API + app (nginx)
  .env.example             settings for Docker
  server/                  Express API
    src/index.js           start-up: connects to MongoDB, starts the server
    src/app.js             routes; also serves the built app online
    src/config.js          reads the settings above
    src/models/            Mongoose models: User, Course, Task, StudySession, StudyLog, Material, Recommendation
    src/routes/            auth, courses, tasks, sessions, logs, materials, recommendations, chat
    src/services/recommendationEngine.js   rules: study gap, ranking, session plan
    src/services/llm.js    recommendation text from the model, with rule-based fallback
    src/services/mailer.js password reset emails (Brevo)
    test/engine.test.js    unit tests for the rules
  client/                  React app (Vite)
    public/                logo, app icons, manifest.webmanifest, sw.js (installable phone app)
    src/App.jsx            sidebar, pages and routes
    src/pages/             Landing, Login, ForgotPassword, Dashboard, Courses, Tasks, Schedule, Materials, Chat
    src/lib/               api helper, login state, data store, themes, dates
    src/styles.css         design and the four themes
```

## Tests

```
cd src/server
npm test
```
