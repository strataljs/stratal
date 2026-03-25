import path from 'node:path';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src/inertia'),
    },
  },
})
