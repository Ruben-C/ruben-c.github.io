import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

/**
 * Emits sw.js from src/sw.js with the list of built files to precache and a
 * version derived from their hashed names, so every deploy gets a fresh cache
 * and the app opens offline right after its first visit.
 */
function serviceWorker(): Plugin {
  return {
    name: 'park-day-service-worker',
    apply: 'build',
    generateBundle(_options, bundle) {
      const built = Object.keys(bundle)
        .filter((file) => /\.(js|css)$/.test(file))
        .sort()
        .map((file) => `./${file}`);
      const precache = ['./', './index.html', './manifest.webmanifest', './icon.svg', ...built];
      const version = createHash('sha1').update(built.join('\n')).digest('hex').slice(0, 10);
      const template = readFileSync(fileURLToPath(new URL('./src/sw.js', import.meta.url)), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template.replaceAll('__PRECACHE__', JSON.stringify(precache)).replaceAll('__VERSION__', version),
      });
    },
  };
}

export default defineConfig({
  // Relative URLs so the build works at https://ruben-c.github.io/park-day/ and from a local folder.
  base: './',
  plugins: [react(), serviceWorker()],
  build: {
    outDir: '../park-day',
    emptyOutDir: true,
  },
});
