import { copyFile, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
// GitHub Pages serves this app shell for direct visits to client-side routes.
await copyFile(new URL('index.html', dist), new URL('404.html', dist));
await writeFile(new URL('.nojekyll', dist), '');
