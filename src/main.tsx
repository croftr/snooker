import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/source-serif-4';
import '@fontsource-variable/inter';
import './styles.css';
import { App } from './App';
import { StoreProvider } from './lib/store';

if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((e) => console.error('Offline support failed to start', e));
    // Asks the browser not to clear unsynced edits when the device is low on space.
    navigator.storage?.persist?.().catch(() => {});
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
