/**
 * The page the desktop shell loads. Everything it needs is in the bundle Vite builds, so the first
 * open needs no network.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { tauriSidecarClient } from './tauri-client.ts';
import './app.css';

const root = document.getElementById('root');
if (root === null) throw new Error('index.html holds no #root element');

createRoot(root).render(
  <StrictMode>
    <App client={tauriSidecarClient} />
  </StrictMode>,
);
