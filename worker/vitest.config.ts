import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

for (const [key, value] of Object.entries(loadEnv('test', process.cwd(), ''))) {
  process.env[key] ??= value;
}

export default defineConfig({
  resolve: {
    dedupe: ['yjs', 'y-protocols', 'lib0', 'zod'],
    alias: [
      {
        find: /^@app\/(.*)$/,
        replacement: fileURLToPath(new URL('../app/src/$1', import.meta.url)),
      },
      { find: 'yjs', replacement: fileURLToPath(new URL('./node_modules/yjs', import.meta.url)) },
      { find: 'y-protocols', replacement: fileURLToPath(new URL('./node_modules/y-protocols', import.meta.url)) },
      { find: 'lib0', replacement: fileURLToPath(new URL('./node_modules/lib0', import.meta.url)) },
      { find: 'zod', replacement: fileURLToPath(new URL('./node_modules/zod', import.meta.url)) },
      {
        find: 'y-partyserver/provider',
        replacement: fileURLToPath(new URL('./node_modules/y-partyserver/dist/provider/index.js', import.meta.url)),
      },
    ],
  },
  test: {
    environment: 'node',
    server: {
      deps: {
        inline: ['y-partyserver', 'partyserver', 'y-protocols', 'lib0', 'yjs', 'zod'],
      },
    },
  },
});
