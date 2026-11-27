import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Icon } from '../icons.jsx';

const UPDATED = 'November 26, 2026';
const REPO = 'https://github.com/alibelhrak/GVSU-CIS641-AIStudyAssistant';

/** Delete the account (shown only when signed in) */
export function DeleteAccount() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [sure, setSure] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!user) {
    return <p>Sign in, then come back to this page to delete your account. You can also delete single items (courses, notes, files, chats) at any time inside the app.</p>;
  }
  const remove = async (e) => {
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api.del('/auth/me', { password });
      signOut();
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <form className="legal-delete" onSubmit={remove}>
      <p>Signed in as <b data-no-translate>{user.email}</b></p>
      <p>This deletes your account and everything in it right away: courses, tasks, sessions, files, notes, chats, the study groups you own, your group messages, reminders and settings. You are also removed from pages and groups others shared with you. It cannot be undone.</p>
      <label>Your password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
      <label className="legal-check"><input type="checkbox" checked={sure} onChange={(e) => setSure(e.target.checked)} /> I understand that all my data will be deleted</label>
      {error && <p className="error-box">{error}</p>}
      <button className="btn danger" type="submit" disabled={!sure || !password || busy}>{busy ? 'Deleting…' : 'Delete my account'}</button>
    </form>
  );
}

export default function Privacy() {
  return (
    <div className="legal">
      <header className="legal-top">
        <Link to="/" className="btn ghost"><Icon name="back" size={16} /> Study Assistant</Link>
      </header>
      <article className="legal-body">
        <h1>Privacy policy</h1>
        <p className="legal-date">Last updated: {UPDATED}</p>
        <p>AI Study Assistant is a study planner made as a term project for CIS 641 at Grand Valley State University. This page explains what the app stores, why, who else sees it, and how to delete it. In short: your data is used only to run the app. There are no ads, no tracking and nothing is sold.</p>

        <h2>What the app stores</h2>
        <ul>
          <li><b>Your account:</b> your name, email address and password. The password is stored only as a secure hash (bcrypt), never as plain text.</li>
          <li><b>What you add:</b> courses, assignments and exams, study sessions and logged hours, materials (files you upload and links), notes, Ask AI conversations, and feedback you give on AI answers (👍 / 👎, with the question and answer).</li>
          <li><b>Sharing and study groups:</b> who you share each page with and their access, your study groups and their members, group chat messages and group deadlines, and whether a page has a public link.</li>
          <li><b>Meetings:</b> the meetings you start or schedule for a study group (name, time, length, link and passcode).</li>
          <li><b>Reports:</b> if you report a page or a message, the report (reason, your comment, and a copy of what was reported) and your account, so it can be reviewed.</li>
          <li><b>Settings:</b> your language, reminder choices, reminder hour and time zone.</li>
          <li><b>Devices for notifications:</b> if you turn on push notifications, the address your browser gives for sending them.</li>
          <li><b>In your browser:</b> your sign-in token, theme, language and a few view settings, saved in local storage. The app uses no tracking cookies and no analytics.</li>
        </ul>

        <h2>How it is used</h2>
        <p>Only to provide the features you use: showing your plan, computing recommendations, answering your AI questions, sending the reminders you turned on, and resetting your password when you ask. Your data is not used for advertising, not sold, and not shared except with the services below.</p>

        <h2>What other students see</h2>
        <p>Everything is private until you share it. When you do:</p>
        <ul>
          <li><b>People you share a page with</b> see that page, your <b>name, email address and profile picture</b>, and, while you have the page open together, your cursor and what you type as you type it.</li>
          <li><b>Members of your study groups</b> see your name, email address and profile picture, your messages in the group chat, the group's deadlines, and the pages shared with the group.</li>
          <li><b>Classmates you invite</b> get an email saying that you shared a page with them or added them to a group, with your name.</li>
          <li><b>A public link</b> ("Share to web") lets anyone who has it read that page and see your name, without an account. Turn it off and the link stops working.</li>
          <li>Your courses, assignments, schedule, files, private pages and Ask AI chats are never shown to other students.</li>
        </ul>
        <p>You can stop sharing, remove someone, leave a page or group, or delete your messages at any time. If you report something, the person you report is not told who reported them. The rules for shared content are in the <Link to="/guidelines">community guidelines</Link>.</p>

        <h2>Services that handle data for the app</h2>
        <ul>
          <li><b>Hosting (Render)</b> runs the app and stores uploaded files.</li>
          <li><b>Database (MongoDB Atlas)</b> stores your account and study data.</li>
          <li><b>AI provider (currently Groq):</b> when you use an AI feature, your message, any files or pictures you attach, and the study data needed to answer (for example course codes, task titles, hours, and the note you are working on) are sent to the AI model to produce the answer. Nothing is sent to the AI when you do not use AI features.</li>
          <li><b>Email (Brevo)</b> sends sign-up codes, password-reset, reminder and invitation emails, and reports to the app's moderator, so it receives your name, email address and the email's content.</li>
          <li><b>Zoom</b>, only if you link your Zoom account (Settings › Connected apps): StudyPilot keeps an encrypted key from Zoom that lets it create, read and cancel the meetings you start from a study group, plus your Zoom email. It cannot see your recordings, chats or contacts. The meeting's name, time and link are shown to your group. Unlink in Settings, or remove the app in your Zoom account, and the key is deleted.</li>
          <li><b>Push services</b> run by your browser's maker (Google, Microsoft, Apple or Mozilla) deliver notifications if you turn them on.</li>
        </ul>

        <h2>Security</h2>
        <p>All traffic uses HTTPS. Passwords are hashed. Password-reset links work once and expire after 30 minutes. Each student can only see their own data and what others chose to share with them. Only the app's moderator reads reports.</p>

        <h2>Keeping and deleting your data</h2>
        <p>Your data is kept until you delete it. You can delete any course, task, session, file, note, chat or group message inside the app, turn off reminder emails with the link in every reminder, and delete your whole account below.</p>
        <section id="delete-account" className="legal-card">
          <h3>Delete your account</h3>
          <DeleteAccount />
        </section>

        <h2>Children</h2>
        <p>The app is meant for students aged 13 and over. It is not directed at children under 13.</p>

        <h2>Terms</h2>
        <p>Using the app also means agreeing to the <Link to="/terms">Terms of Service</Link> and the <Link to="/guidelines">community guidelines</Link>.</p>

        <h2>Changes and contact</h2>
        <p>If this policy changes, the date at the top changes too. For questions or requests, open an issue on the project's <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">GitHub page</a>.</p>
      </article>
    </div>
  );
}
