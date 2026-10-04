import { writeFileSync } from 'node:fs';
// The API uses only Node built-ins; no external runtime dependencies are required.
writeFileSync(new URL('../api-dist/package.json', import.meta.url), JSON.stringify({
  name: 'fitflow-ai', version: '1.0.0', private: true, type: 'module',
  engines: { node: '>=22.18.0' }, scripts: { 'start:api': 'node index.js' }, dependencies: {},
}, null, 2) + '\n');
