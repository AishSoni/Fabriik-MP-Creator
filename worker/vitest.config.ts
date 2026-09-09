import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    dedupe: ['yjs', 'y-protocols', 'lib0', 'zod'],
    alias: [
      {
        find: /^@app\/(.*)$/,
        replacement: fileURLToPath(new URL('../app/src/$1', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
  },
});
