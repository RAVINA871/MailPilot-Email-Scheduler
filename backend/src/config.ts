import "dotenv/config";
const e = process.env;
const port = Number(e.PORT ?? 4000);
const backendUrl = e.BACKEND_URL ?? `http://localhost:${port}`;
export const config = {
  port,
  isProd: e.NODE_ENV === "production",
  frontendUrl: e.FRONTEND_URL ?? "http://localhost:5173",
  backendUrl,
  databaseUrl: e.DATABASE_URL ?? "",
  redisUrl: e.REDIS_URL ?? "redis://localhost:6379",
  esUrl: e.ELASTICSEARCH_URL ?? "http://localhost:9200",
  encryptionKey: e.TOKEN_ENCRYPTION_KEY ?? "",
  adminEmails: (e.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
  sessionTtlMs: 7 * 24 * 3600 * 1000,
  google: {
    id: e.GOOGLE_CLIENT_ID ?? "", secret: e.GOOGLE_CLIENT_SECRET ?? "",
    callback: e.GOOGLE_CALLBACK_URL || `${backendUrl}/auth/google/callback`,
  },
  slack: {
    id: e.SLACK_CLIENT_ID ?? "", secret: e.SLACK_CLIENT_SECRET ?? "",
    callback: e.SLACK_CALLBACK_URL || `${backendUrl}/api/integrations/slack/callback`,
  },
  smtp: { host: e.SMTP_HOST ?? "smtp.ethereal.email", port: Number(e.SMTP_PORT ?? 587), user: e.SMTP_USER ?? "", pass: e.SMTP_PASS ?? "", from: e.SMTP_FROM ?? "" },
  workerConcurrency: Number(e.WORKER_CONCURRENCY ?? 3),
  attempts: Number(e.EMAIL_ATTEMPTS ?? 3),
  backoffMs: Number(e.EMAIL_BACKOFF_MS ?? 5000),
  maxRecipients: 10000,
};
