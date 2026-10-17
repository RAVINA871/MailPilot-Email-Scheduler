import type { Db } from "./db.js";
import { emailQueue, enqueueIndex } from "./queue.js";
// Transactional-outbox relay. Safe to run in many workers: jobId = recipientId makes BullMQ ignore duplicate adds.
export async function publishOutbox(db: Db, batch = 500): Promise<number> {
  const events = await db.outboxEvent.findMany({ where: { publishedAt: null }, take: batch, orderBy: { runAt: "asc" } });
  for (const e of events) {
    await emailQueue.add("send", { recipientId: e.recipientId }, { jobId: e.recipientId, delay: Math.max(0, e.runAt.getTime() - Date.now()) });
    await db.outboxEvent.update({ where: { id: e.id }, data: { publishedAt: new Date() } });
    await enqueueIndex(e.recipientId);
  }
  return events.length;
}
