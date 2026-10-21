import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// The Tauri CLI runs Vite for the app; keep its output on screen instead of clearing it.
export default defineConfig({ plugins: [react()], clearScreen: !process.env.TAURI_ENV_PLATFORM, server: { port: 5173, strictPort: true, proxy: { '/api': {target: process.env.GRAMALYZER_API_ORIGIN ?? 'http://127.0.0.1:8080', changeOrigin: false} } } });
