import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './lib/theme.jsx';
import { AuthProvider } from './lib/auth.jsx';
import App from './App.jsx';
import { initI18n } from './lib/i18n.jsx';
import './styles.css';

// Load the chosen language first, so the app never flashes in English
initI18n().finally(() => createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
));

// Phone app: register the service worker (only in the built app, not while developing)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
