import { Router } from "express";
import type { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import type { Db } from "./db.js";
import { config } from "./config.js";
import { decrypt, encrypt } from "./crypto.js";
import { ApiError } from "./errors.js";
import { getCookie, requireAuth } from "./auth.js";

export interface RateLimitNotice { campaign: { id: string; name: string; userId: string; hourlyLimit: number }; resumeAt: Date }
export type Notifier = (db: Db, redis: Redis, n: RateLimitNotice) => Promise<{ sent: boolean; reason?: string }>;

export async function slackPost(token: string, channel: string, text: string): Promise<void> {
  const r = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ channel, text }),
  });
  const j = (await r.json()) as { ok: boolean; error?: string };
  if (!j.ok) throw new Error(`Slack API error: ${j.error ?? r.status}`);
}

// Deduplicated per campaign per clock hour. Never throws: Slack problems must not break delivery.
export const notifyRateLimit: Notifier = async (db, redis, { campaign, resumeAt }) => {
  const key = `slack:rl:${campaign.id}:${Math.floor(Date.now() / 3_600_000)}`;
  try {
    const first = await redis.set(key, "1", "EX", 3600, "NX");
    if (!first) return { sent: false, reason: "throttled" };
    const integ = await db.integration.findUnique({ where: { userId_provider: { userId: campaign.userId, provider: "SLACK" } } });
    if (!integ) { await redis.del(key); return { sent: false, reason: "slack_not_connected" }; }
    await slackPost(decrypt(integ.encryptedToken), integ.channelId,
      `:warning: MailPilot: campaign *${campaign.name}* reached its hourly limit of ${campaign.hourlyLimit} emails. Remaining emails are deferred and resume after ${resumeAt.toISOString()}.`);
    return { sent: true };
  } catch (e) {
    await redis.del(key).catch(() => {});
    console.error("Slack notification failed:", (e as Error).message);
    return { sent: false, reason: (e as Error).message };
  }
};

export function slackRouter(db: Db) {
  const r = Router();
  r.get("/connect", requireAuth, (_req, res) => {
    if (!config.slack.id || !config.slack.secret) return res.redirect(`${config.frontendUrl}/integrations?slack=not_configured`);
    const state = randomBytes(16).toString("hex");
    res.cookie("mp_slack_state", state, { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: 600_000 });
    const q = new URLSearchParams({ client_id: config.slack.id, scope: "chat:write", redirect_uri: config.slack.callback, state });
    res.redirect(`https://slack.com/oauth/v2/authorize?${q}`);
  });
  r.get("/callback", requireAuth, async (req, res) => {
    const back = (s: string) => res.redirect(`${config.frontendUrl}/integrations?slack=${s}`);
    res.clearCookie("mp_slack_state");
    if (req.query.error) return back("denied");
    if (!req.query.code || !req.query.state || req.query.state !== getCookie(req, "mp_slack_state")) return back("invalid_state");
    try {
      const resp = await fetch("https://slack.com/api/oauth.v2.access", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ client_id: config.slack.id, client_secret: config.slack.secret, code: String(req.query.code), redirect_uri: config.slack.callback }),
      });
      const j = (await resp.json()) as { ok: boolean; access_token?: string; authed_user?: { id: string }; team?: { name: string } };
      if (!j.ok || !j.access_token || !j.authed_user) return back("error");
      const data = { encryptedToken: encrypt(j.access_token), channelId: j.authed_user.id, teamName: j.team?.name ?? null };
      await db.integration.upsert({ where: { userId_provider: { userId: req.user!.id, provider: "SLACK" } }, create: { userId: req.user!.id, provider: "SLACK", ...data }, update: data });
      back("connected");
    } catch (e) { console.error("Slack OAuth failed", (e as Error).message); back("error"); }
  });
  return r;
}
export { ApiError };
