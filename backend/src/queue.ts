import { Queue } from "bullmq";
import { Redis } from "ioredis";
import { config } from "./config.js";
export const connection = new Redis(config.redisUrl, { maxRetriesPerRequest: null });
export const EMAIL_QUEUE = "emails";
export const INDEX_QUEUE = "indexing";
export const emailQueue = new Queue(EMAIL_QUEUE, {
  connection,
  defaultJobOptions: { attempts: config.attempts, backoff: { type: "exponential", delay: config.backoffMs }, removeOnComplete: { count: 5000 }, removeOnFail: { count: 5000 } },
});
export const indexQueue = new Queue(INDEX_QUEUE, {
  connection,
  defaultJobOptions: { attempts: 8, backoff: { type: "exponential", delay: 2000 }, removeOnComplete: { count: 1000 }, removeOnFail: { count: 1000 } },
});
// Index jobs are best-effort: a Redis hiccup must never fail the email flow.
export async function enqueueIndex(recipientId: string) {
  try { await indexQueue.add("idx", { recipientId }); } catch (e) { console.error("enqueueIndex failed", e); }
}
