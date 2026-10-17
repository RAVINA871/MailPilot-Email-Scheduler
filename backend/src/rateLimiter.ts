import type { Redis } from "ioredis";
// Atomic fixed-window (per clock hour) limiter. Over-limit INCRs are rolled back inside the same script.
const LUA = `
local c = redis.call('INCR', KEYS[1])
if c == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
if c > tonumber(ARGV[1]) then redis.call('DECR', KEYS[1]); return 0 end
return 1`;
export interface Slot { allowed: boolean; retryAfterMs: number; key: string }
export async function acquireSlot(redis: Redis, scope: string, limit: number, now = Date.now()): Promise<Slot> {
  const hour = Math.floor(now / 3_600_000);
  const msToNext = (hour + 1) * 3_600_000 - now;
  const key = `rl:${scope}:${hour}`;
  const ok = (await redis.eval(LUA, 1, key, limit, msToNext + 60_000)) as number;
  return { allowed: ok === 1, retryAfterMs: ok === 1 ? 0 : msToNext, key };
}
export async function releaseSlot(redis: Redis, key: string) {
  const v = await redis.decr(key); if (v < 0) await redis.set(key, 0, "KEEPTTL");
}
