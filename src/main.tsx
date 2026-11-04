import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/shrikhand';
import '@fontsource/bungee';
import '@fontsource/gochi-hand';
import '@fontsource-variable/bricolage-grotesque';
import './styles.css';
import { App } from './App';
import { StoreProvider } from './lib/store';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
