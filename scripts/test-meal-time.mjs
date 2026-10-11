import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';

const source = readFileSync(new URL('../src/utils/mealTime.ts', import.meta.url), 'utf8');
const url = `data:text/javascript;base64,${Buffer.from(stripTypeScriptTypes(source)).toString('base64')}`;
const { mealTypeAtTime } = await import(url);
for (let minute = 0; minute < 1440; minute++) {
  const hour = Math.floor(minute / 60);
  const expected = hour >= 5 && hour < 11 ? 'breakfast'
    : hour >= 11 && hour < 15 ? 'lunch'
    : hour >= 15 && hour < 21 ? 'dinner' : 'snack';
  assert.equal(mealTypeAtTime(new Date(2026, 0, 1, hour, minute % 60, 59)), expected);
}
console.log('PASS: local-time meal classification for all 1440 minutes, including boundaries');
