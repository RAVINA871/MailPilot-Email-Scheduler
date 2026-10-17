import express, { type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { existsSync } from "node:fs";
import path from "node:path";
import { ZodError } from "zod";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { db } from "./db.js";
import { config } from "./config.js";
import { ApiError } from "./errors.js";
import { authRouter, originCheck, requireAuth } from "./auth.js";
import { slackRouter, slackPost } from "./slack.js";
import { decrypt } from "./crypto.js";
import { connection, emailQueue, indexQueue } from "./queue.js";
import { campaignSchema } from "./validation.js";
import { parseRecipients } from "./recipients.js";
import { es, searchEmails } from "./search.js";

const upload = multer({
  storage: multer.memoryStorage(), limits: { fileSize: 2_000_000, files: 1 },
  fileFilter: (_r, f, cb) => (/\.(csv|txt)$/i.test(f.originalname) ? cb(null, true) : cb(new ApiError(400, "Recipient file must be .csv or .txt"))),
});
const wrap = (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const page = (v: unknown, d: number, max: number) => Math.min(max, Math.max(1, Number(v) || d));

function statusWhere(status: string | undefined, userId: string) {
  const base = { campaign: { userId } }; const now = new Date();
  switch (status) {
    case "scheduled": return { ...base, status: "SCHEDULED" as const, sendAt: { gt: now } };
    case "pending": return { ...base, OR: [{ status: "SCHEDULED" as const, sendAt: { lte: now } }, { status: "SENDING" as const }] };
    case "sent": return { ...base, status: "SENT" as const };
    case "failed": return { ...base, status: "FAILED" as const };
    case undefined: case "": return base;
    default: throw new ApiError(400, "status must be scheduled, pending, sent or failed");
  }
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "100kb" }));

  app.get("/health", async (_req, res) => {
    const check = async (fn: () => Promise<unknown>) => { try { await fn(); return "up"; } catch { return "down"; } };
    const [database, redis, elasticsearch] = await Promise.all([check(() => db.$queryRaw`SELECT 1`), check(() => connection.ping()), check(() => es.ping())]);
    res.status(database === "up" && redis === "up" ? 200 : 503).json({ ok: database === "up" && redis === "up", database, redis, elasticsearch });
  });

  app.use("/auth", authRouter());
  app.use("/api/integrations/slack", slackRouter(db));

  // --- Bull Board: authenticated; admins only in production (ADMIN_EMAILS), any signed-in user in development. Job data holds only recipient IDs.
  const board = new ExpressAdapter(); board.setBasePath("/admin/queues");
  createBullBoard({ queues: [new BullMQAdapter(emailQueue, { readOnlyMode: true }), new BullMQAdapter(indexQueue, { readOnlyMode: true })], serverAdapter: board });
  app.use("/admin/queues", requireAuth, (req, _res, next) =>
    config.isProd && !config.adminEmails.includes(req.user!.email) ? next(new ApiError(403, "Admin only")) : next(), board.getRouter());

  const api = express.Router();
  api.use(originCheck, requireAuth);

  api.get("/me", (req, res) => res.json(req.user));

  api.get("/stats", wrap(async (req, res) => {
    const uid = req.user!.id;
    const [scheduled, pending, sent, failed] = await Promise.all(["scheduled", "pending", "sent", "failed"].map((s) => db.recipient.count({ where: statusWhere(s, uid) })));
    res.json({ scheduled, pending, sent, failed });
  }));

  api.post("/recipients/preview", upload.single("recipients"), wrap(async (req, res) => {
    if (!req.file) throw new ApiError(400, "Recipient file is required");
    const { valid, invalid } = parseRecipients(req.file.buffer.toString("utf8"));
    res.json({ validCount: valid.length, invalidCount: invalid.length, invalid: invalid.slice(0, 50), sample: valid.slice(0, 5) });
  }));

  api.post("/campaigns", upload.single("recipients"), wrap(async (req, res) => {
    const parsed = campaignSchema.parse(req.body);
    if (!req.file) throw new ApiError(400, "Recipient file is required");
    const key = req.header("idempotency-key")?.slice(0, 100) || null;
    const userId = req.user!.id;
    if (key) {
      const ex = await db.campaign.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } }, include: { _count: { select: { recipients: true } } } });
      if (ex) return res.status(200).json({ campaignId: ex.id, scheduled: ex._count.recipients, invalid: [], duplicate: true });
    }
    const { valid, invalid } = parseRecipients(req.file.buffer.toString("utf8"));
    if (!valid.length) throw new ApiError(400, "No valid recipients found in the uploaded file", { invalid: invalid.slice(0, 50) });
    if (valid.length > config.maxRecipients) throw new ApiError(400, `Too many recipients (max ${config.maxRecipients})`);
    const start = parsed.startAt.getTime();
    try {
      const campaign = await db.$transaction(async (tx) => {
        const c = await tx.campaign.create({ data: { userId, name: parsed.name, subject: parsed.subject, body: parsed.body, startAt: parsed.startAt, delaySeconds: parsed.delaySeconds, hourlyLimit: parsed.hourlyLimit, idempotencyKey: key } });
        const recs = await tx.recipient.createManyAndReturn({ data: valid.map((email, i) => ({ campaignId: c.id, email, position: i, sendAt: new Date(start + i * parsed.delaySeconds * 1000) })) });
        await tx.outboxEvent.createMany({ data: recs.map((r) => ({ recipientId: r.id, runAt: r.sendAt })) });
        return c;
      }, { timeout: 60_000 });
      res.status(201).json({ campaignId: campaign.id, scheduled: valid.length, invalid: invalid.slice(0, 50), invalidCount: invalid.length });
    } catch (e) {
      if ((e as { code?: string }).code === "P2002" && key) { // concurrent duplicate submit
        const ex = await db.campaign.findUnique({ where: { userId_idempotencyKey: { userId, idempotencyKey: key } }, include: { _count: { select: { recipients: true } } } });
        if (ex) return res.status(200).json({ campaignId: ex.id, scheduled: ex._count.recipients, invalid: [], duplicate: true });
      }
      throw e;
    }
  }));

  api.get("/campaigns", wrap(async (req, res) => {
    const list = await db.campaign.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: "desc" }, take: 100, include: { _count: { select: { recipients: true } } } });
    res.json(list.map(({ body: _b, ...c }) => c));
  }));

  api.get("/emails", wrap(async (req, res) => {
    const p = page(req.query.page, 1, 100000), size = page(req.query.pageSize, 20, 100);
    const where = statusWhere(req.query.status as string | undefined, req.user!.id);
    const [total, rows] = await Promise.all([db.recipient.count({ where }), db.recipient.findMany({
      where, orderBy: [{ sendAt: "desc" }, { position: "asc" }], skip: (p - 1) * size, take: size,
      include: { campaign: { select: { name: true, subject: true } }, attempts: { where: { ok: true }, orderBy: { createdAt: "desc" }, take: 1 } },
    })]);
    res.json({ total, page: p, pageSize: size, items: rows.map((r) => ({ id: r.id, email: r.email, status: r.status, sendAt: r.sendAt, sentAt: r.sentAt, lastError: r.lastError, campaignName: r.campaign.name, subject: r.campaign.subject, previewUrl: r.attempts[0]?.previewUrl ?? null })) });
  }));

  api.get("/search", wrap(async (req, res) => {
    res.json(await searchEmails(req.user!.id, { q: String(req.query.q ?? "").slice(0, 200) || undefined, status: (req.query.status as string) || undefined, page: page(req.query.page, 1, 1000), pageSize: page(req.query.pageSize, 20, 100) }));
  }));

  api.get("/integrations", wrap(async (req, res) => {
    const s = await db.integration.findUnique({ where: { userId_provider: { userId: req.user!.id, provider: "SLACK" } } });
    res.json({ google: { connected: true, email: req.user!.email }, slack: { configured: !!(config.slack.id && config.slack.secret), connected: !!s, team: s?.teamName ?? null } });
  }));
  api.delete("/integrations/slack", wrap(async (req, res) => { await db.integration.deleteMany({ where: { userId: req.user!.id, provider: "SLACK" } }); res.json({ ok: true }); }));
  api.post("/integrations/slack/test", wrap(async (req, res) => {
    const s = await db.integration.findUnique({ where: { userId_provider: { userId: req.user!.id, provider: "SLACK" } } });
    if (!s) throw new ApiError(400, "Slack is not connected");
    try { await slackPost(decrypt(s.encryptedToken), s.channelId, ":white_check_mark: MailPilot test notification"); } catch (e) { throw new ApiError(502, (e as Error).message); }
    res.json({ ok: true });
  }));
  app.use("/api", api);

  const dist = path.resolve(process.cwd(), "../frontend/dist");
  if (existsSync(dist)) { app.use(express.static(dist)); app.get(/^\/(?!api|auth|admin|health).*/, (_q, r) => r.sendFile(path.join(dist, "index.html"))); }

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ZodError) return res.status(400).json({ error: "Validation failed", errors: err.issues.map((i) => ({ field: i.path.join("."), message: i.message })) });
    if (err instanceof ApiError) return res.status(err.status).json({ error: err.message, ...(err.details as object) });
    if (err instanceof multer.MulterError) return res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({ error: err.code === "LIMIT_FILE_SIZE" ? "File too large (max 2 MB)" : err.message });
    console.error(err); res.status(500).json({ error: "Internal server error" });
  });
  return app;
}
