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
      <p>This deletes your account and everything in it right away: courses, tasks, sessions, files, notes, chats, reminders and settings. It cannot be undone.</p>
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
          <li><b>Settings:</b> your language, reminder choices, reminder hour and time zone.</li>
          <li><b>Devices for notifications:</b> if you turn on push notifications, the address your browser gives for sending them.</li>
          <li><b>In your browser:</b> your sign-in token, theme, language and a few view settings, saved in local storage. The app uses no tracking cookies and no analytics.</li>
        </ul>

        <h2>How it is used</h2>
        <p>Only to provide the features you use: showing your plan, computing recommendations, answering your AI questions, sending the reminders you turned on, and resetting your password when you ask. Your data is not used for advertising, not sold, and not shared except with the services below.</p>

        <h2>Services that handle data for the app</h2>
        <ul>
          <li><b>Hosting (Render)</b> runs the app and stores uploaded files.</li>
          <li><b>Database (MongoDB Atlas)</b> stores your account and study data.</li>
          <li><b>AI provider (currently Groq):</b> when you use an AI feature, your message, any files or pictures you attach, and the study data needed to answer (for example course codes, task titles, hours, and the note you are working on) are sent to the AI model to produce the answer. Nothing is sent to the AI when you do not use AI features.</li>
          <li><b>Email (Brevo)</b> sends password-reset and reminder emails, so it receives your name, email address and the email's content.</li>
          <li><b>Push services</b> run by your browser's maker (Google, Microsoft, Apple or Mozilla) deliver notifications if you turn them on.</li>
        </ul>

        <h2>Security</h2>
        <p>All traffic uses HTTPS. Passwords are hashed. Password-reset links work once and expire after 30 minutes. Each student can only see their own data.</p>

        <h2>Keeping and deleting your data</h2>
        <p>Your data is kept until you delete it. You can delete any course, task, session, file, note or chat inside the app, turn off reminder emails with the link in every reminder, and delete your whole account below.</p>
        <section id="delete-account" className="legal-card">
          <h3>Delete your account</h3>
          <DeleteAccount />
        </section>

        <h2>Children</h2>
        <p>The app is meant for students aged 13 and over. It is not directed at children under 13.</p>

        <h2>Changes and contact</h2>
        <p>If this policy changes, the date at the top changes too. For questions or requests, open an issue on the project's <a href={`${REPO}/issues`} target="_blank" rel="noopener noreferrer">GitHub page</a>.</p>
      </article>
    </div>
  );
}
