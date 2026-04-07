import { defineConfig } from 'vite';
import * as path from 'path';

export default defineConfig({
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, '../dist/client'),
    emptyOutDir: true,
  },
});
