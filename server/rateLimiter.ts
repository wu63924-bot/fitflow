import { isIP } from 'node:net';

export function clientKey(forwardedFor: string | string[] | undefined) {
  for (const value of (Array.isArray(forwardedFor) ? forwardedFor.join(',') : forwardedFor || '').split(',')) {
    const ip = value.trim();
    if (isIP(ip)) return ip;
  }
  return 'unknown-client';
}

export class RateLimiter {
  private readonly clients = new Map<string, { windowStart: number; count: number }>();
  private nextCleanup = 0;
  private readonly max: number;
  private readonly windowMs: number;
  constructor(max: number, windowMs: number) { this.max = max; this.windowMs = windowMs; }
  allow(key: string, now = Date.now()) {
    if (now >= this.nextCleanup) {
      for (const [client, state] of this.clients) {
        if (now - state.windowStart >= this.windowMs) this.clients.delete(client);
      }
      this.nextCleanup = now + this.windowMs;
    }
    let state = this.clients.get(key);
    if (!state || now - state.windowStart >= this.windowMs) {
      state = { windowStart: now, count: 0 };
      this.clients.set(key, state);
    }
    if (state.count >= this.max) return false;
    state.count++;
    return true;
  }
}
