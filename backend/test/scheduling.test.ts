import { describe, it, expect, beforeEach } from "vitest";
import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { db } from "../src/db";
import { emailQueue, EMAIL_QUEUE } from "../src/queue";
import { publishOutbox } from "../src/outbox";
import { makeCampaign, makeUser, reset } from "./helpers";
beforeEach(reset);
describe("outbox → BullMQ scheduling", () => {
  it("publishes delayed jobs at each recipient's sendAt, once, and marks outbox rows published", async () => {
    const { user } = await makeUser(); const start = new Date(Date.now() + 3_600_000);
    const { recipients } = await makeCampaign(user.id, ["a@x.com", "b@x.com", "c@x.com"], { delaySeconds: 60, startAt: start });
    expect(await publishOutbox(db)).toBe(3);
    expect(await publishOutbox(db)).toBe(0); // nothing left
    const delayed = await emailQueue.getDelayed(); expect(delayed).toHaveLength(3);
    const byId = Object.fromEntries(delayed.map((j) => [j.id, j.opts.delay!]));
    const base = byId[recipients[0].id]; expect(byId[recipients[1].id] - base).toBeGreaterThan(59_000); expect(byId[recipients[2].id] - base).toBeLessThan(121_000);
    expect(await db.outboxEvent.count({ where: { publishedAt: null } })).toBe(0);
  });
  it("duplicate scheduling is impossible: re-publishing the same outbox row yields one job", async () => {
    const { user } = await makeUser(); const { recipients } = await makeCampaign(user.id, ["a@x.com"], { startAt: new Date(Date.now() + 60_000) });
    await publishOutbox(db);
    await db.outboxEvent.updateMany({ data: { publishedAt: null } }); // simulate crash after queue.add but before DB mark
    await publishOutbox(db);
    expect((await emailQueue.getJobCounts("delayed", "waiting")).delayed).toBe(1);
    expect(await emailQueue.getJob(recipients[0].id)).toBeTruthy();
  });
  it("DB enforces unique recipient per campaign", async () => {
    const { user } = await makeUser(); const { campaign } = await makeCampaign(user.id, ["a@x.com"]);
    await expect(db.recipient.create({ data: { campaignId: campaign.id, email: "a@x.com", position: 9, sendAt: new Date() } })).rejects.toThrow();
  });
  it("jobs live in Redis, so a fresh connection (as after an app restart) still sees them", async () => {
    const { user } = await makeUser(); await makeCampaign(user.id, ["a@x.com", "b@x.com"], { startAt: new Date(Date.now() + 3_600_000) }); await publishOutbox(db);
    const fresh = new Redis(process.env.REDIS_URL!, { maxRetriesPerRequest: null }); const q = new Queue(EMAIL_QUEUE, { connection: fresh });
    expect((await q.getJobCounts("delayed")).delayed).toBe(2); await q.close(); fresh.disconnect();
  });
});
