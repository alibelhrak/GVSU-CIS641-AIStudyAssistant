import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Icon } from '../icons.jsx';
import '../landing.css';

/**
 * Two pages in one:
 *  /forgot-password          → type your email, get a reset link
 *  /reset-password?token=... → the link from the email: choose a new password
 */
export default function ForgotPassword() {
  const { authenticate } = useAuth();
  const { pathname, search, state } = useLocation();
  const navigate = useNavigate();
  const token = new URLSearchParams(search).get('token') || '';
  const resetting = pathname === '/reset-password';

  const [email, setEmail] = useState(state?.email || '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const askForLink = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try { await api.post('/auth/forgot', { email }); setSent(true); } catch (err) { setError(err.message); }
    setBusy(false);
  };

  const saveNewPassword = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError('The two passwords do not match');
    setBusy(true);
    setError('');
    // Saves the new password and signs in (the server answers like /auth/login)
    try { await authenticate('reset', { token, password }); navigate('/', { replace: true }); }
    catch (err) { setError(err.message); setBusy(false); }
    return undefined;
  };

  let body;
  if (resetting && !token) {
    body = (
      <>
        <h1>Link not complete</h1>
        <p className="muted">This reset link is missing its code. Open the link from your email again, or ask for a new one.</p>
        <Link className="btn primary block" to="/forgot-password">Get a new link</Link>
      </>
    );
  } else if (resetting) {
    body = (
      <>
        <h1>Choose a new password</h1>
        <p className="muted">Pick something you have not used here before. You will be signed in right after.</p>
        <div className="login-fields">
          <label>New password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
            placeholder="At least 8 characters" autoComplete="new-password" autoFocus /></label>
          <label>Confirm new password<input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8}
            placeholder="Type it again" autoComplete="new-password" /></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? <span className="spinner" aria-label="Please wait" /> : 'Save and sign in'}
        </button>
        {error.includes('expired') && <p className="switch"><Link className="linklike" to="/forgot-password">Get a new link</Link></p>}
      </>
    );
  } else if (sent) {
    body = (
      <>
        <h1>Check your email</h1>
        <p className="muted">
          If an account uses <b>{email}</b>, we sent it a link to reset your password. The link works for 30 minutes.
          Don't see it? Check your spam folder.
        </p>
        <button className="btn block" type="button" onClick={() => setSent(false)}>Use a different email</button>
      </>
    );
  } else {
    body = (
      <>
        <h1>Forgot your password?</h1>
        <p className="muted">Type the email you signed up with and we'll send you a link to choose a new password.</p>
        <div className="login-fields">
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email"
            placeholder="you@school.edu" autoFocus /></label>
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn primary block" type="submit" disabled={busy}>
          {busy ? <span className="spinner" aria-label="Please wait" /> : 'Send reset link'}
        </button>
      </>
    );
  }

  return (
    <div className="login">
      <div className="blob b1" /><div className="blob b2" /><div className="blob b3" />
      <Link className="back-home" to="/login"><Icon name="back" size={16} /> Sign in</Link>
      <form className="login-card" onSubmit={resetting ? saveNewPassword : askForLink} key={`${resetting}-${sent}`}>
        <span className="logo"><Icon name={sent ? 'check' : 'shield'} size={22} /></span>
        {body}
        {!resetting && !sent && (
          <p className="switch">Remembered it? <Link className="linklike" to="/login">Sign in</Link></p>
        )}
      </form>
    </div>
  );
}
