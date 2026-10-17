import { db } from "../src/db";
import { connection } from "../src/queue";
import { createSession } from "../src/auth";

export async function reset() {
  await db.$executeRawUnsafe('TRUNCATE "OutboxEvent","DeliveryAttempt","Recipient","Campaign","Integration","Session","User" CASCADE');
  await connection.flushdb();
}
export async function makeUser(email = "u@example.com") {
  const user = await db.user.create({ data: { googleId: `g-${email}`, email, name: "Test User" } });
  return { user, cookie: `mp_session=${await createSession(db, user.id)}` };
}
// Mirrors what POST /api/campaigns writes (campaign + recipients + outbox rows).
export async function makeCampaign(userId: string, emails: string[], o: { delaySeconds?: number; hourlyLimit?: number; startAt?: Date } = {}) {
  const startAt = o.startAt ?? new Date(); const delay = o.delaySeconds ?? 0;
  const c = await db.campaign.create({ data: { userId, name: "Camp", subject: "Hello", body: "Body", startAt, delaySeconds: delay, hourlyLimit: o.hourlyLimit ?? 100 } });
  const recs = await db.recipient.createManyAndReturn({ data: emails.map((email, i) => ({ campaignId: c.id, email, position: i, sendAt: new Date(startAt.getTime() + i * delay * 1000) })) });
  await db.outboxEvent.createMany({ data: recs.map((r) => ({ recipientId: r.id, runAt: r.sendAt })) });
  return { campaign: c, recipients: recs };
}
export async function waitFor(fn: () => Promise<boolean>, ms = 15000) {
  const end = Date.now() + ms;
  while (Date.now() < end) { if (await fn()) return; await new Promise((r) => setTimeout(r, 100)); }
  throw new Error("waitFor timed out");
}
