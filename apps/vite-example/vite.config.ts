import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import windforge from '@windforge/vite';

export default defineConfig({
  plugins: [
    react(),
    windforge({
      entry: './src/global.css',
      diagnostics: true,
    }),
  ],
});
