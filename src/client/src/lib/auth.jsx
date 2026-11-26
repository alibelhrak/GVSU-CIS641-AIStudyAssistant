import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const signOut = () => { setToken(null); setUser(null); };

  // On page load: if a token is saved, ask the server who it belongs to
  useEffect(() => {
    setUnauthorizedHandler(signOut);
    if (!getToken()) { setReady(true); return; }
    api.get('/auth/me').then((r) => setUser(r.user)).catch(signOut).finally(() => setReady(true));
  }, []);

  const signIn = ({ token, user: u }) => { setToken(token); setUser(u); };

  // mode is 'login' or 'register'. A new account (or one whose email was never confirmed)
  // gets { needsVerification, email, ticket } back instead of a token.
  const authenticate = async (mode, form) => {
    try {
      const data = await api.post(`/auth/${mode}`, form);
      if (data.needsVerification) return data;
      signIn(data);
      return null;
    } catch (err) {
      if (err.data?.needsVerification) return err.data;
      throw err;
    }
  };

  // Enter the emailed 6-digit code
  const verifyEmail = async (email, ticket, code) => signIn(await api.post('/auth/verify', { email, ticket, code }));

  return <AuthContext.Provider value={{ user, ready, authenticate, verifyEmail, signIn, setUser, signOut }}>{children}</AuthContext.Provider>;
}