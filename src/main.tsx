import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/dm-sans/400.css';
import '@fontsource/dm-sans/500.css';
import '@fontsource/dm-sans/600.css';
import '@fontsource/dm-sans/700.css';
import App from './App';
import { detectLang, I18nProvider, loadLang } from './i18n';
import './styles.css';
// load the visitor's language before the first render, so the page doesn't flash English first
const lang = detectLang();
loadLang(lang).catch(() => undefined).then(() => createRoot(document.getElementById('root')!).render(<React.StrictMode><I18nProvider initial={lang}><App /></I18nProvider></React.StrictMode>));
