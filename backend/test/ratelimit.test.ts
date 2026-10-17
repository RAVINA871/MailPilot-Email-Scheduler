import { describe, it, expect, beforeEach } from "vitest";
import { connection } from "../src/queue";
import { acquireSlot, releaseSlot } from "../src/rateLimiter";
import { reset } from "./helpers";
beforeEach(reset);
describe("atomic hourly rate limiter (real Redis)", () => {
  it("allows exactly `limit` of 30 concurrent acquisitions", async () => {
    const res = await Promise.all(Array.from({ length: 30 }, () => acquireSlot(connection, "c1", 7)));
    expect(res.filter((r) => r.allowed)).toHaveLength(7);
    expect(res.filter((r) => !r.allowed).every((r) => r.retryAfterMs > 0 && r.retryAfterMs <= 3_600_000)).toBe(true);
  });
  it("isolates scopes and rolls over in the next hour", async () => {
    const t = 1_800_000_000_000;
    expect((await acquireSlot(connection, "a", 1, t)).allowed).toBe(true);
    expect((await acquireSlot(connection, "a", 1, t + 10)).allowed).toBe(false);
    expect((await acquireSlot(connection, "b", 1, t)).allowed).toBe(true);
    expect((await acquireSlot(connection, "a", 1, t + 3_600_000)).allowed).toBe(true);
  });
  it("releaseSlot frees capacity (used after failed sends)", async () => {
    const s = await acquireSlot(connection, "r", 1); expect(s.allowed).toBe(true);
    await releaseSlot(connection, s.key); expect((await acquireSlot(connection, "r", 1)).allowed).toBe(true);
  });
});
