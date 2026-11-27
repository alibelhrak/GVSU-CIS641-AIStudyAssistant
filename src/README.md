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
| `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` | For Zoom | From your Zoom app (see "Zoom meetings" below). Without them, groups can still schedule meetings with a pasted link |
| `ZOOM_WEBHOOK_SECRET` | For Zoom | The Zoom app's **Secret Token** (Features › Access), used to check Zoom's "app removed" events |
| `REPORT_EMAIL` | No | Where reports of shared pages and chat messages are sent (default: `MAIL_FROM`). Use an inbox you read |
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
| `POST /auth/register` | Create an account (`{ name, email, password, acceptTerms: true }`: the sign-up checkbox "13 or older and I agree to the Terms"; the date is saved as `termsAcceptedAt`). It stays locked until the email is confirmed: returns `{ needsVerification, email, ticket }` and emails a 6-digit code |
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
| `/groups` | Study groups: list, create `{ name, description, color }`, open (`GET /:id`: members, deadlines, shared pages), rename / delete (owner). Members: `POST /:id/members { email }` sends an **invitation** (`Group.invites`; they are not a member and see nothing until they accept), `DELETE /:id/invites/:userId` cancels it (owner or sender), `DELETE /:id/members/:userId` (or `me` to leave). Invitations: `GET /groups/invites` (mine, waiting), `POST /:id/accept`, `POST /:id/decline` (whoever sent it is told). Chat: `GET /:id/messages?after=`, `POST`, `DELETE /:id/messages/:mid`. Deadlines: `/:id/tasks` CRUD |
| `POST /reports` | Login optional: `{ kind: 'page' \| 'public' \| 'message', id, reason, details }`. Saves a Report and emails the moderator (at most 10 an hour per person) |
| `GET`/`POST /reports/:id/moderate?sig=` | **No login**, signed link from the report email: shows the report, and takes the content down on confirm |
| `GET /zoom/status`, `POST`/`DELETE /zoom/link` | Is Zoom set up and linked; start linking (returns Zoom's address); unlink (revokes the token) |
| `GET /zoom/callback`, `POST /zoom/webhook` | **No login**: where Zoom sends the student back after linking (signed `state`), and Zoom's events (signed with `ZOOM_WEBHOOK_SECRET`: endpoint check and "app deauthorized") |
| `/groups/:id/meetings` | `GET` upcoming and live meetings; `POST { topic, start?, duration, link? }` (no `start` = now; no `link` = a new Zoom meeting from my account); `GET /:mid/start` (the host link, only for whoever made it); `DELETE /:mid` (its maker or the group owner; also cancels it on Zoom, and emails a calendar cancellation); `GET /:mid/ics` (the meeting as a `.ics` file) |
| `/notes/:id/messages` | The chat on a shared page (409 when the page is not shared): `GET ?after=`, `POST { text }`, `DELETE /:mid` (your own; the page owner can delete any) |
| `/notes/:id/versions` | Page history (owner and editors): `GET` the list, `GET /:vid` one version, `POST` keep a copy now (the app calls it before restoring) |
| `/notes/:id/comments` | Comments on text: `GET` the threads, `POST { quote, text }` a new one (owner and editors), `POST /:cid/replies { text }` (anyone who can open the page), `PATCH /:cid { resolved }` (owner and editors), `DELETE /:cid` (whoever started it, or the owner) |
| `/notes/:id/suggestions` | Suggested edits: `GET` the open ones (owner and editors: all; others: their own; `stale` = the page changed since), `POST { content, message }` (at most 5 waiting per person), `GET /:sid` the suggested page, `POST /:sid/accept` or `/:sid/reject` (owner and editors; the author can reject = withdraw their own) |
| `POST /notes/:id/lock` | Owner only: `{ on }`. A locked page refuses every change to its title, icon, cover and content with **423** (also from live editing) until it is unlocked |
| `/notes/:id/rows` | Databases: `GET` the properties and views (`db`), the rows and the people who can be picked; `POST { title, props, rank }` a new row (owner and editors; rows belong to the database's owner); `POST /delete { ids }` move rows to the Trash. `POST /notes { database: 'blank' \| 'assignments' \| 'reading' \| 'exams', parent? }` makes a database from a template; `PATCH /notes/:id { db }` changes its properties and views; `PATCH /notes/:rowId { props: { propId: value \| null } }` changes some values of a row |
| `…/messages` (chats) | Study group chat (`/groups/:id/messages`) and page chat (`/notes/:id/messages`): `GET ?v=2&since=<time>&seen=1` answers `{ messages, reads, now }`: without `since` the latest messages, with it every message added **or changed** (a reaction) since then; `seen=1` (the chat is open on screen) records that this person has seen it (`ChatRead`), and `reads` says when each other person last did ("Seen by …"). Without `v=2` the old list form still works. `POST /:mid/react { emoji }` adds or takes back a reaction (👍 ❤️ 😂 😮 😢 🙏 🎉 ✅, up to 3 per person per message) |
| `/notifications` | The inbox: `GET` the 60 newest, `GET /count` the unread count, `POST /read { ids? }` mark some (or all) read, `DELETE` remove the read ones |
| `WS /collab/:noteId?token=` | Live co-editing (WebSocket, Yjs protocol); see below |
| `POST /notes/:id/duplicate` | Copy a page: the owner's copy stays in the same place; someone it is shared with gets the copy in their own notes |
| `GET /search?q=` | Quick Find: pages (titles, text; mine and shared with me, with a snippet and the parent page), courses, assignments, study groups. No `q`: recent pages |
| `GET /notes/:id/people`, `GET /notes/:id/backlinks` | Who can be @mentioned on a page (everyone who can open it), and the pages that link to it |
| `GET /links/preview?url=` | Title, description, picture and site name of a public web page, for Web bookmark blocks. Private, local and cloud-metadata addresses are refused (checked after every redirect); 6 s and 600 KB limits |
| `/conversations` | Chat history: list (`GET`), open (`GET /:id`), save (`POST`, `PATCH /:id`) and delete (`DELETE /:id`) |

## Sharing and live co-editing

- **Who can open a page** (`server/src/services/access.js`): the owner; people in `note.shares` as `viewer` (read only) or `editor`; and members of a study group in `note.groups` (they edit). Guests can only change `title, icon, cover, coverY, content, text, markdown`; moving, deleting, the course tag and sharing stay with the owner. Guests never see the owner's folders or course.
- **Live editing** (`server/src/services/collab.js`): a WebSocket at `/api/collab/:noteId?token=` speaks the [y-websocket](https://github.com/yjs/y-websocket) protocol. The server checks the token and the role (401 / 403), keeps one Yjs document per open page in memory, relays changes and cursors, and ignores changes sent by viewers. A room is dropped 30 seconds after the last person leaves. Only shared pages use it (409 otherwise); private pages keep the normal save.
- **First load:** when a room starts empty, the first editor to ask `POST /notes/:id/collab/seed` fills it from the saved page; the others wait for it. Editors keep saving the page through `PATCH /notes/:id` as before, so the database always has the latest copy and the AI features, search and the public link keep working.
- **Browser** (`client/src/lib/live.js`): `y-websocket`'s `WebsocketProvider` and BlockNote's `withCollaboration()` (cursors and names). The title, icon and cover go through a shared Yjs map. If the socket can't connect in 9 seconds, the page falls back to normal saving and says so.
- **Invite emails** (`server/src/services/invites.js`): inviting someone to a page (not changing their role) or adding them to a group sends them an email through Brevo, in their own language, with a button to the page or group, plus a push notification if they turned those on. It runs in the background, so a failed email never blocks the invite.
- **Reports** (`server/src/routes/reports.js`): the 🚩 button sends `POST /api/reports`. A page can be reported by anyone it is shared with (or anyone, from its public link); a chat message by the other members of the group. Each report is saved with a copy of the content and emailed to `REPORT_EMAIL` (or `MAIL_FROM`). The email's **Review and take it down** button opens a page signed with `JWT_SECRET`; confirming there unshares the page (its owner keeps it, its public link stops) or deletes the message. This covers Microsoft Store policy 11.12 and Google Play's user-generated content policy, together with the community guidelines page at `/guidelines`.
- **Page history** (`server/src/services/versions.js`): before a save, the server keeps a `NoteVersion` of the page when the save removes 40 % or more of a page of 200+ characters, and at most every 15 minutes otherwise (40 per page, 60 days). Restoring goes through the editor (`replaceBlocks`), so it reaches live editors and Ctrl+Z works.
- **Notes AI safety** (`routes/notesChat.js`): `replace_page` is refused when the model only saw part of the page, or when the new page is much shorter than the old one; changes cut off by the token limit are not applied; long tool arguments are summarized before the follow-up request.
- **@mentions and backlinks** (`server/src/services/mentions.js`): on every save the server scans the page for `mention` inline content (a person, a page or a date) and links to `/notes/<id>`, stores them as `Note.links` / `Note.mentions`, and emails people who were newly mentioned (only if they can open the page).
- **Databases** (`server/src/services/database.js`, `client/src/pages/Database.jsx`): a database is a `Note` with `db = { props, views }`; each row is a `Note` with `inDb` (and `parent`) pointing to it, `props` (values by property id) and `rank`. The server checks every value against the property's type (`cleanValues`) and every view (`cleanSchema`: at most 40 properties, 12 views, 2000 rows). A row can be opened by everyone who can open its database (`services/access.js`), rows are left out of `GET /notes` (they live inside their database), and deleting or duplicating a database takes its rows along. Filtering, sorting and the four layouts run in the browser; property and view changes are saved half a second after the last one, except a new option, which is saved before the value that uses it.
- **Comments** (`client/src/pages/comments.jsx`): a custom BlockNote style `comment` holds the thread id on the commented words, so the highlight moves with the text and travels through live editing. Resolving or deleting a thread removes the style from the page; the threads themselves are `NoteComment` documents.
- **Suggested edits** (`client/src/pages/Suggestions.jsx`): a viewer edits a private copy (not connected to the live room, never saved to the page). The server stores the suggested blocks with the page text before and after; the review window shows a line diff. Accepting keeps a Page history copy first and then applies the blocks through the editor, so live editors get them too.
- **Notifications** (`server/src/services/notify.js`): `inbox()` saves a `Notification` (never for your own actions; 200 per person). Shares, group invites, meetings, @mentions, comments and suggestions call it, next to the email and push notification they already sent.
- **Page lock:** `Note.locked`. `PATCH /notes/:id` answers 423 for content changes, the live room treats everyone as a viewer, and locking or unlocking closes the room so open editors reconnect with the new rights.
- **Export and import** (`client/src/pages/noteFiles.js`): Markdown with BlockNote's `blocksToMarkdownLossy`; Word with the `docx` library (headings, styles, lists, tables, images, code, callouts, links); PDF through the browser's print dialog with a print-only copy of the page. Import reads Word files with `mammoth` and Markdown / HTML with BlockNote's parsers. Both libraries load only when used.
- **Hosting:** Render's free plan supports WebSockets. The rooms live in one server's memory, so running several server copies would need a shared Yjs backend (e.g. Redis); one copy is fine for this project.

## Zoom meetings

Study groups can start or schedule Zoom meetings. Only the student who **starts** a meeting needs their Zoom account linked; everyone else joins with the link. `server/src/services/zoom.js` does the OAuth linking (tokens encrypted with AES-256-GCM, refreshed automatically, revoked on unlink or account deletion), and `routes/groups.js` creates, starts and cancels meetings through Zoom's API (`POST /users/me/meetings`, `GET`/`DELETE /meetings/:id`). Members are emailed in their own language and time zone (`services/invites.js`). Scheduled meetings attach a calendar invitation (`services/calendar.js`, iCalendar `METHOD:REQUEST`, sent through Brevo as `invite.ics`); cancelling sends `METHOD:CANCEL` with the same `UID`, so calendars remove it.

### Set it up (once, about 15 minutes)

1. Sign in at [marketplace.zoom.us](https://marketplace.zoom.us) with your Zoom account › **Develop › Build App › General App**. Choose **User-managed**.
2. **Basic information › OAuth information:**
   - **OAuth Redirect URL:** `https://gvsu-cis641-aistudyassistant.onrender.com/api/zoom/callback`
   - **OAuth Allow List:** the same address.
   - Copy the **Client ID** and **Client Secret**.
3. **Scopes › Add scopes:** `meeting:write:meeting`, `meeting:read:meeting`, `meeting:delete:meeting` and `user:read:user`. Nothing else is needed.
4. **Features › Access:** copy the **Secret Token**. Turn on **Event subscription**, add the event **App deauthorized** (under *App*), and set the endpoint to `https://gvsu-cis641-aistudyassistant.onrender.com/api/zoom/webhook`. Click **Validate** (the server answers Zoom's check once step 5 is deployed).
5. On Render › **Environment**, add `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET` and `ZOOM_WEBHOOK_SECRET`. Save (Render restarts).
6. Try it: **Settings › Connected apps › Link Zoom**, then **Start Zoom** in a study group.

### Who can link Zoom

- While the Zoom app is **in development**, only Zoom users in **your own Zoom account** can link it. Zoom's **beta test** gives an authorization link for up to 100 outside testers for 90 days.
- For **every student** to link Zoom, submit the app for Zoom's review (**Publish › Submit for review**). Zoom asks for the app's privacy policy (`/privacy`), terms (`/terms`), a support link, a short description and screenshots, and checks the requested scopes and the deauthorization event. Review usually takes a few weeks.
- Until then, groups can **Schedule** with **Paste a link** (Zoom, Teams, Google Meet), which needs no setup.
- School Zoom accounts (for example `gvsu.zoom.us`) may require the IT department to approve outside apps before students can link them.

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
    src/models/            Mongoose models: User, Course, Task, StudySession, StudyLog, Material, Recommendation, Conversation, Note, Folder, Group, GroupMessage, GroupTask, GroupMeeting, ZoomLink, Report, NoteVersion, NoteMessage, TrashItem, Feedback, PushSub, ReminderLog
    src/routes/            auth, courses, tasks, sessions, logs, materials, recommendations, chat, conversations, notes (and the notes AI), notesChat (the Notes AI panel), groups (study groups), public (pages shared to the web)
    src/services/recommendationEngine.js   rules: study gap, ranking, session plan
    src/services/llm.js    recommendation text from the model, with rule-based fallback
    src/services/chatTools.js  the actions Ask AI can take (checked and limited to the student's own data)
    src/services/mailer.js password reset and reminder emails (Brevo)
    src/services/access.js who may open or edit a note page
    src/services/collab.js live co-editing over WebSocket (Yjs)
    src/services/invites.js invite emails for shared pages and study groups
    src/services/calendar.js  calendar invitations (.ics) and Add-to-calendar links
    src/services/zoom.js   linking Zoom (encrypted tokens) and calling Zoom's API
    src/routes/zoom.js     link / unlink Zoom, the OAuth callback and Zoom's webhook
    src/routes/reports.js  reporting shared content, and the moderator's take-down link
    src/services/mentions.js  @mentions and page links (backlinks, mention emails)
    src/routes/search.js   Quick Find (Ctrl+K)
    src/services/versions.js  page history (copies before big removals and every 15 minutes)
    src/services/trash.js  moving to the Trash, restoring, and deleting for good after 30 days
    src/services/reminders.js  morning summary, deadline, session and weekly reminders (email and push)
    test/engine.test.js    unit tests for the rules
  client/                  React app (Vite)
    public/                logo, app icons, manifest.webmanifest, sw.js (installable app)
    public/.well-known/assetlinks.json   proves to Android that the Google Play app and this website belong together
    src/App.jsx            sidebar, pages and routes
    src/pages/             Landing, Login, ForgotPassword, Dashboard, Courses, Tasks, Schedule, Materials, Notes, NoteAI (AI inside notes), NotesChat (the Notes AI panel), NoteShare (Share window, faces), Groups (study groups), PublicNote (read-only public page), Report (the report window), blocks.jsx (Callout, Equation, Table of contents, Columns, Embed, Web bookmark), PageChat (chat on a shared page), PageHistory, EmojiPicker, NoteLink (link toolbar), GroupMeetings (the Meetings panel), Terms, Guidelines (community guidelines), Privacy, Chat (Ask AI)
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
