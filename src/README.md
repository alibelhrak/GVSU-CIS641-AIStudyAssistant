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
| `CHAT_MODEL` | No | A different model just for Ask AI, for example `openai/gpt-oss-120b` (default: `LLM_MODEL`). It must support tool calling |
| `VISION_MODEL` | For pictures | A model that can read images, used only when a picture is attached in Ask AI, for example `qwen/qwen3.8-27b` on Groq |
| `BREVO_API_KEY` | For email | Brevo API key (starts with `xkeysib-`) for password reset emails |
| `MAIL_FROM` | For email | The sender address you verified in Brevo |
| `MAIL_FROM_NAME` | No | Sender name (default `Study Assistant`) |
| `APP_URL` | For email | The site address used in reset links (default `http://localhost:5173`) |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | For push | Keys for push notifications. Create them once with `npx web-push generate-vapid-keys` (in `src/server`) |
| `VAPID_SUBJECT` | No | Contact for the push services, for example `mailto:you@example.com` (default: `MAIL_FROM`) |
| `CRON_SECRET` | For reminders | Long random text. The scheduler sends it to `POST /api/reminders/run`; put the same value in GitHub (Settings → Secrets → Actions) |
| `UPLOAD_DIR` | No | Where uploaded files are saved (default `./uploads`) |

Without the AI settings, recommendations use rule-based text and Ask AI is turned off. Without `VISION_MODEL`, Ask AI still reads attached PDFs and text files, but not pictures. Without the email settings, reset emails are printed in the server terminal instead of being sent, which is handy for testing.

`GET /api/health` shows what is turned on, for example `{"ok":true,"llm":true,"chat":true}`.

## Deploy on Render (free)

One web service runs the API and also serves the built React app.

| Setting | Value |
|---|---|
| Root Directory | `src` |
| Build Command | `cd client && npm ci && npm run build && cd ../server && npm ci --omit=dev` |
| Start Command | `cd server && npm start` |
| Environment | `MONGO_URI`, `JWT_SECRET`, `NODE_VERSION=22`, plus the AI and email settings above |

In MongoDB Atlas, allow access from anywhere (`0.0.0.0/0`), because Render's address changes.

The server also serves `/.well-known/assetlinks.json` from the built app. Express hides folders that start with a dot, so `app.js` allows that one folder explicitly. After the first Google Play upload, add Google's **App signing key SHA-256** (Play Console, then App integrity) as a second fingerprint in that file, or the Play Store version opens with an address bar. After pushing to GitHub, use **Manual Deploy → Deploy latest commit** if auto-deploy is off.

Uploaded files are saved on the server's disk. On Render's free plan that disk is wiped on every deploy or restart, so uploads there are not permanent.

Notes are different: pictures inside notes and cover pictures are made smaller in the browser and saved inside the note in MongoDB, so they survive deploys. A cover is at most about 1.4 MB.

## API

All routes start with `/api`. Every route except `/auth/*` and `/health` needs the header `Authorization: Bearer <token>`.

| Route | What it does |
|---|---|
| `POST /auth/register` | Create an account. It stays locked until the email is confirmed: returns `{ needsVerification, email, ticket }` and emails a 6-digit code |
| `POST /auth/verify` | `{ email, ticket, code }`: confirms the email, returns a token and the user. 5 wrong codes and the code stops working; codes last 15 minutes |
| `POST /auth/resend-code` | `{ email, ticket }`: a new code (at most one a minute, five an hour) |
| `POST /auth/login` | Sign in; returns a token and the user, or `403 { needsVerification, ticket }` if the email was never confirmed |
| `GET /auth/me` | The signed-in user |
| `DELETE /auth/me` | Delete the account and all its data (`{ password }`); used by the Privacy page |
| `PATCH /auth/me` | Save `{ name, language, avatar, prefs }` (`avatar`: a small square picture as a data URL, or `""` to remove); `prefs` = theme, accent, font, size, motion, weekStart, startPage (synced to every device) |
| `POST /auth/password` | `{ current, next }`: change the password; signs out every other device and returns a new token |
| `POST /auth/logout-all` | Sign out of every other device (tokens carry a session version) |
| `POST /auth/email/start`, `POST /auth/email/confirm` | Change email: password + new address, then the 6-digit code sent to the new address; the old address gets a notice |
| `GET /auth/me/export` | Download all of the account's data as one JSON file |
| `/trash` | The Trash: list (`GET`, with `expiresAt`), `POST /trash/:id/restore`, delete one for good (`DELETE /:id`) or empty it (`DELETE /trash`) |
| `/folders` | Folders in the notes list: list, create `{ name }`, rename (`PATCH /:id`), delete (`DELETE /:id`, its pages are kept). A page joins a folder with `PATCH /notes/:id { folder }` |
| `POST /notes/complete` | `{ language, before, after, title }` → `{ text }`: an AI code suggestion for the cursor in a code block (fast model, or `CODE_MODEL`; at most 20 a minute per student) |
| `POST /auth/forgot` | Emails a reset link (always gives the same answer, so it never reveals who has an account) |
| `POST /auth/reset` | Sets a new password with the code from the link and signs in |
| `/courses`, `/tasks`, `/sessions`, `/logs` | List, create (`POST`), update (`PATCH /:id`) and delete (`DELETE /:id`) |
| `/materials` | List; `POST /materials/upload` (files), `POST /materials/link`, `GET /materials/:id/file` (download), `DELETE /materials/:id` |
| `POST /recommendations/generate` | Works out the current advice and returns it |
| `POST /recommendations/:id/accept` / `dismiss` | Accept (adds the sessions) or dismiss advice |
| `POST /chat` | Ask AI: sends the conversation (with attached file text and pictures) and streams the answer back, one JSON object per line: `text` pieces and `action` cards. The AI can call tools to add courses, tasks and study sessions, log time, update tasks, and search, read, write or add to notes |
| `/notes` | Notes: list without content (`GET`), `GET /notes/search?q=`, open (`GET /:id`), create (`POST`), save (`PATCH /:id`: title, icon, cover, coverY, favorite, parent, course, content) and delete (`DELETE /:id`, also deletes its sub-pages) |
| `POST /notes/ai` | AI inside a note: sends `{ action, prompt, selection, page, title, language }` and streams back Markdown as plain text. Actions: improve, fix, shorter, longer, simplify, professional, explain, bullets, table, translate, continue, summary, takeaways, quiz, flashcards, todos, outline, brainstorm |
| `POST /notes/chat` | The Notes AI panel: sends `{ title, blocks: [{ id, md }], messages }` and streams back one JSON object per line: `text`, `edit` (a change for the browser to apply: edit, insert, delete a block, or rewrite the page) and `error` |
| `POST /notes/feedback` | Saves a 👍 or 👎 on an AI answer (`{ rating, prompt, answer }`) in the Feedback collection |
| `GET`/`PUT /reminders/settings` | Which reminders are on, the hour, time zone, and email / push |
| `POST`/`DELETE /reminders/devices` | Turn push notifications on or off for one browser or phone |
| `POST /reminders/test` | Sends a test summary email and push now |
| `POST /reminders/run` | **No login**, needs the header `x-cron-secret`. Sends every reminder that is due (called every 15 minutes by `.github/workflows/reminders.yml`) |
| `GET /reminders/unsubscribe` | **No login**: the signed link in reminder emails that turns them off |
| `GET /notes/shared` | Pages other students shared with me (directly or through a study group), with the owner and my role |
| `GET /notes/:id/sharing` | Owner only: who has the page (`shares`), its study groups, my groups and the `publicId` |
| `POST /notes/:id/share` | Owner only: `{ email, role: 'viewer' \| 'editor' }`. Only existing, verified accounts (404 otherwise); at most 50 people |
| `PATCH`/`DELETE /notes/:id/share/:userId` | Change someone's role, or remove them. `DELETE /notes/:id/share/me` lets a guest leave the page |
| `PUT /notes/:id/groups` | Owner only: `{ groups: [ids] }` of the owner's own study groups |
| `POST /notes/:id/public` | Owner only: `{ on }` turns the public read-only link on (a random id) or off |
| `GET /public/notes/:publicId` | **No login**: a page shared to the web, read only |
| `/groups` | Study groups: list, create `{ name, description, color }`, open (`GET /:id`: members, deadlines, shared pages), rename / delete (owner). Members: `POST /:id/members { email }`, `DELETE /:id/members/:userId` (or `me` to leave). Chat: `GET /:id/messages?after=`, `POST`, `DELETE /:id/messages/:mid`. Deadlines: `/:id/tasks` CRUD |
| `WS /collab/:noteId?token=` | Live co-editing (WebSocket, Yjs protocol); see below |
| `/conversations` | Chat history: list (`GET`), open (`GET /:id`), save (`POST`, `PATCH /:id`) and delete (`DELETE /:id`) |

## Sharing and live co-editing

- **Who can open a page** (`server/src/services/access.js`): the owner; people in `note.shares` as `viewer` (read only) or `editor`; and members of a study group in `note.groups` (they edit). Guests can only change `title, icon, cover, coverY, content, text, markdown`; moving, deleting, the course tag and sharing stay with the owner. Guests never see the owner's folders or course.
- **Live editing** (`server/src/services/collab.js`): a WebSocket at `/api/collab/:noteId?token=` speaks the [y-websocket](https://github.com/yjs/y-websocket) protocol. The server checks the token and the role (401 / 403), keeps one Yjs document per open page in memory, relays changes and cursors, and ignores changes sent by viewers. A room is dropped 30 seconds after the last person leaves. Only shared pages use it (409 otherwise); private pages keep the normal save.
- **First load:** when a room starts empty, the first editor to ask `POST /notes/:id/collab/seed` fills it from the saved page; the others wait for it. Editors keep saving the page through `PATCH /notes/:id` as before, so the database always has the latest copy and the AI features, search and the public link keep working.
- **Browser** (`client/src/lib/live.js`): `y-websocket`'s `WebsocketProvider` and BlockNote's `withCollaboration()` (cursors and names). The title, icon and cover go through a shared Yjs map. If the socket can't connect in 9 seconds, the page falls back to normal saving and says so.
- **Hosting:** Render's free plan supports WebSockets. The rooms live in one server's memory, so running several server copies would need a shared Yjs backend (e.g. Redis); one copy is fine for this project.

## Reminders (email and push)

Render's free server sleeps, so it cannot run its own timer. `.github/workflows/reminders.yml` wakes it every 15 minutes and calls `POST /api/reminders/run`, which sends whatever is due in each student's own time zone. A ReminderLog makes sure nothing is sent twice, even when a run is late or repeated.

1. In `src/server`, run `npx web-push generate-vapid-keys`, and put both keys on Render as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`.
2. Make up a long random `CRON_SECRET`, and put it on Render and in GitHub (repository **Settings → Secrets and variables → Actions → New repository secret**).
3. Run the workflow once by hand (**Actions → Study reminders → Run workflow**) to check it.

GitHub pauses scheduled workflows in a repository with no commits for 60 days; re-enable it in the Actions tab if that happens. Waking the server every 15 minutes keeps it running all month, which fits in Render's free 750 hours for one service.

## Languages

The app works in English, French, Spanish, Arabic (right to left), Chinese and Hindi.

- **Browser:** `client/src/lib/i18n.jsx` translates the page as it renders, using the English text as the key and the dictionaries in `client/src/locales/*.json`. Numbers become `{n}`, so "3 days left" and "5 days left" share one entry. Anything typed by the student (notes, chat messages, titles, course names) is never translated: such elements are skipped, or marked `data-no-translate`. To add a text, write it in English in the component and add the same English key with its translation to each locale file.
- **Server:** the browser sends `X-Lang` with each request, and the account keeps `language` for emails sent later by the scheduler. `server/src/i18n.js` holds the email, push and recommendation texts; the AI prompts add "answer in <language>".
- **Add a language:** add it to `LANGS` in `i18n.jsx`, a locale file, the `User.language` list, and its column in `server/src/i18n.js`.

## Trash

Deleting a course, task, session, logged hours, material, page or chat does not remove it right away. `server/src/services/trash.js` first copies the record, and everything removed with it, into a `TrashItem` (a course takes its tasks, sessions, logged hours and materials; a page takes its sub-pages), then deletes the originals. The delete answers `{ ok, trashId }`, which the app uses for the **Undo** button.

- **Restore** puts the same records back with the same ids and dates. A task, session or material whose course is gone asks for the course to be restored first. A page whose parent page, course or folder is gone comes back at the top level / without it. A restored course gets its tag back on the notes that had it.
- **Uploaded files** stay on disk while their material is in the Trash and are removed when it is deleted for good.
- **After 30 days** items are deleted for good: by the scheduled reminder run (`runReminders`), and whenever the student opens the Trash.
- Deleting the account also empties its Trash.

## Running code in Notes

The **Run** button on code blocks runs the code in the student's browser, never on the server, so it costs nothing and can't harm the server. `client/src/lib/runCode.js` picks the runner:

| Language | How it runs | Time limit |
|---|---|---|
| Python | `client/src/run/pyWorker.js`: Pyodide 0.28 (CPython in WebAssembly) in a worker, loaded from jsDelivr the first time; packages are loaded from the program's imports. Set `VITE_PYODIDE_URL` at build time to host the files yourself | 90 s on the first run (download), then 20 s |
| JavaScript | a new worker for each run, `console.*` captured | 10 s |
| SQL | `client/src/run/sqlWorker.js`: SQLite (`sql.js`), a fresh database for each run, results as text tables | 10 s |
| HTML | a preview window: an `<iframe sandbox="allow-scripts">`, so the page can't reach the app or the account | none |

When the time is up, the worker is stopped (`terminate()`), which ends endless loops. The result goes in a code block with the language `output`, placed right after the code; running again replaces it.

## Project structure

```
src/
  docker-compose.yml       MongoDB + API + app (nginx)
  .env.example             settings for Docker
  server/                  Express API
    src/index.js           start-up: connects to MongoDB, starts the server
    src/app.js             routes; also serves the built app online
    src/config.js          reads the settings above
    src/models/            Mongoose models: User, Course, Task, StudySession, StudyLog, Material, Recommendation, Conversation, Note, Folder, Group, GroupMessage, GroupTask, TrashItem, Feedback, PushSub, ReminderLog
    src/routes/            auth, courses, tasks, sessions, logs, materials, recommendations, chat, conversations, notes (and the notes AI), notesChat (the Notes AI panel), groups (study groups), public (pages shared to the web)
    src/services/recommendationEngine.js   rules: study gap, ranking, session plan
    src/services/llm.js    recommendation text from the model, with rule-based fallback
    src/services/chatTools.js  the actions Ask AI can take (checked and limited to the student's own data)
    src/services/mailer.js password reset and reminder emails (Brevo)
    src/services/access.js who may open or edit a note page
    src/services/collab.js live co-editing over WebSocket (Yjs)
    src/services/trash.js  moving to the Trash, restoring, and deleting for good after 30 days
    src/services/reminders.js  morning summary, deadline, session and weekly reminders (email and push)
    test/engine.test.js    unit tests for the rules
  client/                  React app (Vite)
    public/                logo, app icons, manifest.webmanifest, sw.js (installable app)
    public/.well-known/assetlinks.json   proves to Android that the Google Play app and this website belong together
    src/App.jsx            sidebar, pages and routes
    src/pages/             Landing, Login, ForgotPassword, Dashboard, Courses, Tasks, Schedule, Materials, Notes, NoteAI (AI inside notes), NotesChat (the Notes AI panel), NoteShare (Share window, faces), Groups (study groups), PublicNote (read-only public page), Chat (Ask AI)
    src/lib/               api helper, login state, data store, themes, dates, install.jsx (Download app button), runCode.js (Run in code blocks), trash.jsx (Trash window), avatar.jsx (profile picture), resize.jsx (drag to resize), live.js (live co-editing)
    src/run/               the Python (Pyodide) and SQL (SQLite) workers
    src/styles.css         design, the four themes and the scrollbars
    src/notes.css          the notes page, the / menu, covers and their animations
```

## Tests

```
cd src/server
npm test
```
