import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Forge Custom UI requires a static directory containing index.html + bundled
// JS/CSS. We build to ./build and point the manifest at that folder.
//
// `base: ''` produces relative asset URLs (`./assets/foo.js` instead of
// `/assets/foo.js`) — required because Forge serves the iframe from a unique
// URL that does NOT match the asset paths.
export default defineConfig({
  plugins: [react()],
  base: '',
  build: {
    outDir: 'build',
    emptyOutDir: true,
    target: 'es2020',
    sourcemap: false,
  },
});
