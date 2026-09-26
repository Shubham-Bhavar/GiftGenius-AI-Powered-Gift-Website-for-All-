import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts of the original design, self-hosted (no Google Fonts request).
import '@fontsource/cormorant-garamond/400.css';
import '@fontsource/cormorant-garamond/600.css';
import '@fontsource/cormorant-garamond/700.css';
import '@fontsource/cormorant-garamond/400-italic.css';
import '@fontsource/cormorant-garamond/600-italic.css';
import '@fontsource/outfit/300.css';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';
// The homepage stylesheet (unchanged), then the inner pages built on the same design tokens.
import './styles/giftgenius.css';
import './styles/pages.css';
import App, { createQueryClient } from './App.jsx';

const queryClient = createQueryClient();

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App queryClient={queryClient} />
  </StrictMode>,
);
