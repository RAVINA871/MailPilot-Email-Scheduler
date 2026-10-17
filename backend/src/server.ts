import { createApp } from "./app.js";
import { config } from "./config.js";
import { db } from "./db.js";
import { connection } from "./queue.js";
const missing = ["DATABASE_URL", "TOKEN_ENCRYPTION_KEY"].filter((k) => !process.env[k]);
if (missing.length) { console.error(`Missing required env vars: ${missing.join(", ")}`); process.exit(1); }
if (!config.google.id) console.warn("GOOGLE_CLIENT_ID not set: Google sign-in will be unavailable");
if (!config.slack.id) console.warn("SLACK_CLIENT_ID not set: Slack integration will show a setup message");
const server = createApp().listen(config.port, () => console.log(`MailPilot API listening on ${config.backendUrl}`));
const stop = async () => { server.close(); await db.$disconnect(); connection.disconnect(); process.exit(0); };
process.on("SIGTERM", stop); process.on("SIGINT", stop);
