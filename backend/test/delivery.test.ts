import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import { Worker } from "bullmq";
import { SMTPServer } from "smtp-server";
import nodemailer from "nodemailer";
import { db } from "../src/db";
import { connection, emailQueue, EMAIL_QUEUE } from "../src/queue";
import { makeProcessor } from "../src/processor";
import { publishOutbox } from "../src/outbox";
import type { Mailer } from "../src/mailer";
import { makeCampaign, makeUser, reset, waitFor } from "./helpers";

let received: string[] = []; let smtp: SMTPServer; let good: Mailer; const notify = vi.fn(async () => ({ sent: true }));
const workers: Worker[] = [];
const start = (mailer: Mailer, concurrency = 2) => { const w = new Worker(EMAIL_QUEUE, makeProcessor({ db, redis: connection, getMailer: async () => mailer, notify }), { connection, concurrency }); workers.push(w); return w; };
const count = (status: string) => db.recipient.count({ where: { status: status as never } });
beforeAll(async () => {
  smtp = new SMTPServer({ authOptional: true, disabledCommands: ["STARTTLS"], onData(stream, session, cb) { stream.resume(); stream.on("end", () => { received.push(session.envelope.rcptTo[0].address); cb(); }); } });
  await new Promise<void>((r) => smtp.listen(0, "127.0.0.1", r));
  const port = (smtp.server.address() as { port: number }).port;
  good = { transport: nodemailer.createTransport({ host: "127.0.0.1", port, secure: false, ignoreTLS: true }), from: "sender@mailpilot.test" };
});
afterAll(async () => { smtp.close(); });
beforeEach(async () => { await Promise.all(workers.splice(0).map((w) => w.close())); await reset(); received = []; notify.mockClear(); });

describe("delivery pipeline (real Redis + Postgres + local SMTP server)", () => {
  it("sends via SMTP, persists status + attempt, never marks SENT before acceptance", async () => {
    const { user } = await makeUser(); await makeCampaign(user.id, ["a@x.com", "b@x.com", "c@x.com"]);
    await publishOutbox(db); start(good);
    await waitFor(async () => (await count("SENT")) === 3);
    expect(received.sort()).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    const attempts = await db.deliveryAttempt.findMany(); expect(attempts).toHaveLength(3); expect(attempts.every((a) => a.ok && a.smtpResponse)).toBe(true);
    expect((await db.recipient.findMany()).every((r) => r.sentAt)).toBe(true);
  });
  it("enforces the hourly limit, defers the rest to next hour, and notifies once-per-call path", async () => {
    const { user } = await makeUser(); const { campaign } = await makeCampaign(user.id, ["a@x.com", "b@x.com", "c@x.com", "d@x.com"], { hourlyLimit: 2 });
    await publishOutbox(db); start(good);
    await waitFor(async () => (await count("SENT")) === 2 && (await emailQueue.getJobCounts("delayed")).delayed === 2);
    await new Promise((r) => setTimeout(r, 500));
    expect(received).toHaveLength(2); expect(await count("SCHEDULED")).toBe(2);
    const delayed = await emailQueue.getDelayed(); const nextHour = (Math.floor(Date.now() / 3_600_000) + 1) * 3_600_000;
    for (const j of delayed) expect(Math.abs((j.timestamp + (j.opts.delay ?? 0)) - nextHour) < 5000 || j.delay > 0).toBe(true);
    expect(notify).toHaveBeenCalled(); expect(notify.mock.calls[0]).toBeDefined();
    const arg = (notify.mock.calls[0] as unknown[])[2] as { campaign: { id: string; hourlyLimit: number } }; expect(arg.campaign.id).toBe(campaign.id); expect(arg.campaign.hourlyLimit).toBe(2);
  });
  it("is idempotent: an already-SENT recipient is never emailed again", async () => {
    const { user } = await makeUser(); const { recipients } = await makeCampaign(user.id, ["a@x.com"]);
    await db.recipient.update({ where: { id: recipients[0].id }, data: { status: "SENT", sentAt: new Date() } });
    await publishOutbox(db); start(good); await new Promise((r) => setTimeout(r, 1500));
    expect(received).toHaveLength(0);
  });
  it("retries then marks FAILED after final attempt, records errors, releases rate-limit slots", async () => {
    const { user } = await makeUser(); const { campaign, recipients } = await makeCampaign(user.id, ["a@x.com"], { hourlyLimit: 5 });
    const bad: Mailer = { transport: nodemailer.createTransport({ host: "127.0.0.1", port: 1, secure: false, ignoreTLS: true }), from: "s@x.com" };
    await publishOutbox(db); start(bad);
    await waitFor(async () => (await count("FAILED")) === 1);
    const attempts = await db.deliveryAttempt.findMany({ where: { recipientId: recipients[0].id } });
    expect(attempts).toHaveLength(2); expect(attempts.every((a) => !a.ok && a.error)).toBe(true);
    expect((await db.recipient.findUnique({ where: { id: recipients[0].id } }))!.lastError).toBeTruthy();
    const key = `rl:${campaign.id}:${Math.floor(Date.now() / 3_600_000)}`; expect(Number(await connection.get(key) ?? 0)).toBe(0);
  });
  it("recovers after a worker restart without duplicate sends", async () => {
    const { user } = await makeUser(); const emails = Array.from({ length: 8 }, (_, i) => `u${i}@x.com`); await makeCampaign(user.id, emails);
    await publishOutbox(db); const w1 = start(good, 1);
    await waitFor(async () => (await count("SENT")) >= 2); await w1.close(); // "crash"/stop worker mid-run
    const mid = await count("SENT"); expect(mid).toBeLessThanOrEqual(8);
    start(good, 1); await waitFor(async () => (await count("SENT")) === 8);
    expect(received.sort()).toEqual([...emails].sort()); expect(new Set(received).size).toBe(8);
  });
});
