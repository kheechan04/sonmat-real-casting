import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Pin the MediaPipe WASM CDN URL to the installed JS package version (as in Shadow Mitts).
const mpVersion = JSON.parse(
  readFileSync(new URL('./node_modules/@mediapipe/tasks-vision/package.json', import.meta.url), 'utf8'),
).version as string;

export default defineConfig({
  base: './',
  define: { __MP_VERSION__: JSON.stringify(mpVersion) },
  // the pose worker (src/app/poseWorker.ts) is a module worker
  worker: { format: 'es' },
  // pages: the game, the M0 observer (landmark recording / replay), the species model gallery
  build: {
    // (the page list lives here too — with rolldownOptions set, rollupOptions.input was ignored and only
    // index.html got built)
    rolldownOptions: {
      input: { main: 'index.html', observe: 'observe.html', models: 'models.html' },
      // three.js in a file of its own: it rarely changes, so a returning player's browser keeps it across
      // deploys. It is ~700 kB by itself (the 3D engine), hence the higher warning limit.
      output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules[\/]three[\/]/ }] } },
    },
    chunkSizeWarningLimit: 800,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
