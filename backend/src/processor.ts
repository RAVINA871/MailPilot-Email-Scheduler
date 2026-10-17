import { DelayedError, type Job } from "bullmq";
import type { Redis } from "ioredis";
import type { Db } from "./db.js";
import { acquireSlot, releaseSlot } from "./rateLimiter.js";
import { enqueueIndex } from "./queue.js";
import type { Mailer } from "./mailer.js";
import type { Notifier } from "./slack.js";
import { getPreview } from "./preview.js";

export interface Deps { db: Db; redis: Redis; getMailer: () => Promise<Mailer>; notify: Notifier }
export function makeProcessor(d: Deps) {
  return async (job: Job, token?: string) => {
    const r = await d.db.recipient.findUnique({ where: { id: job.data.recipientId }, include: { campaign: true } });
    if (!r || r.status === "SENT") return; // idempotent: already delivered (or deleted)
    const slot = await acquireSlot(d.redis, r.campaignId, r.campaign.hourlyLimit);
    if (!slot.allowed) {
      // +position ms keeps deferred recipients in original order when the next hour begins
      const resumeAt = new Date(Date.now() + slot.retryAfterMs + (r.position % 1000));
      await d.notify(d.db, d.redis, { campaign: r.campaign, resumeAt });
      await job.moveToDelayed(resumeAt.getTime(), token);
      throw new DelayedError();
    }
    await d.db.recipient.update({ where: { id: r.id }, data: { status: "SENDING" } });
    let info;
    try {
      const m = await d.getMailer();
      info = await m.transport.sendMail({ from: m.from, to: r.email, subject: r.campaign.subject, text: r.campaign.body });
    } catch (e) {
      await releaseSlot(d.redis, slot.key);
      const final = job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
      const msg = (e as Error).message.slice(0, 500);
      await d.db.$transaction([
        d.db.recipient.update({ where: { id: r.id }, data: { status: final ? "FAILED" : "SCHEDULED", lastError: msg } }),
        d.db.deliveryAttempt.create({ data: { recipientId: r.id, ok: false, error: msg } }),
      ]);
      await enqueueIndex(r.id);
      throw e;
    }
    // SMTP accepted the message. NOTE: a crash between sendMail and this write can cause one duplicate on retry.
    await d.db.$transaction([
      d.db.recipient.update({ where: { id: r.id }, data: { status: "SENT", sentAt: new Date(), lastError: null } }),
      d.db.deliveryAttempt.create({ data: { recipientId: r.id, ok: true, smtpResponse: String(info.response ?? "").slice(0, 300), previewUrl: getPreview(info) } }),
    ]);
    await enqueueIndex(r.id);
  };
}
