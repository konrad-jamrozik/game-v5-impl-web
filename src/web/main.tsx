/** Entry point of the browser adapter: starts the Session over IndexedDB and renders the interface. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { IndexedDbStorage } from './indexeddb-storage.ts';
import { boot } from './store.ts';
import { installTableOverflowTitles } from './ui.tsx';
import './styles.css';

const root = document.getElementById('root');
if (root === null) {
  throw new Error('The page has no root element');
}
const mount = createRoot(root);
installTableOverflowTitles();

boot(new IndexedDbStorage(indexedDB)).then(
  () => {
    mount.render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  },
  (error: unknown) => {
    // A defective Game build reports its data defect here; no Campaign can be created from it.
    mount.render(
      <main className="fatal">
        <h1>The game cannot start</h1>
        <p>{error instanceof Error ? error.message : 'Unknown error'}</p>
      </main>,
    );
  },
);
