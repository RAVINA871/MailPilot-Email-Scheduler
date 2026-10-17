import { Worker } from "bullmq";
import { db } from "./db.js";
import { config } from "./config.js";
import { connection, EMAIL_QUEUE, INDEX_QUEUE } from "./queue.js";
import { makeProcessor } from "./processor.js";
import { getMailer } from "./mailer.js";
import { notifyRateLimit } from "./slack.js";
import { publishOutbox } from "./outbox.js";
import { indexRecipient } from "./search.js";

const emailWorker = new Worker(EMAIL_QUEUE, makeProcessor({ db, redis: connection, getMailer, notify: notifyRateLimit }), { connection, concurrency: config.workerConcurrency });
const indexWorker = new Worker(INDEX_QUEUE, async (job) => indexRecipient(db, job.data.recipientId), { connection, concurrency: 5 });
for (const w of [emailWorker, indexWorker]) w.on("failed", (j, e) => console.error(`[${w.name}] job ${j?.id} failed: ${e.message}`));
emailWorker.on("completed", (j) => console.log(`[emails] job ${j.id} done`));

let busy = false;
const relay = setInterval(async () => {
  if (busy) return; busy = true;
  try { const n = await publishOutbox(db); if (n) console.log(`[outbox] published ${n} jobs`); } catch (e) { console.error("[outbox] relay error", (e as Error).message); } finally { busy = false; }
}, 2000);

async function shutdown() {
  console.log("Shutting down worker gracefully...");
  clearInterval(relay);
  await Promise.all([emailWorker.close(), indexWorker.close()]);
  await db.$disconnect(); process.exit(0);
}
process.on("SIGTERM", shutdown); process.on("SIGINT", shutdown);
console.log(`MailPilot worker started (concurrency=${config.workerConcurrency})`);
