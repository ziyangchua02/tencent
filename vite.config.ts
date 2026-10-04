import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createApi } from './server/api.ts';
import { openStore } from './server/store.ts';

try { process.loadEnvFile(); } catch { /* no .env file */ }

// In development the same API handler runs inside Vite, so `npm run dev` is one process.
export default defineConfig({
  root: 'web',
  build: { outDir: '../dist', emptyOutDir: true },
  server: { host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 5173) },
  plugins: [
    react(),
    {
      name: 'pill-api',
      configureServer(server) {
        const api = createApi(openStore(process.env.DB_PATH ?? 'data/pills.db'));
        server.middlewares.use((req, res, next) => void api(req, res, next));
      },
    },
  ],
});
