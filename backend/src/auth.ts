import { Router, type NextFunction, type Request, type Response } from "express";
import { randomBytes } from "node:crypto";
import { db, type Db } from "./db.js";
import { config } from "./config.js";
import { sha256 } from "./crypto.js";
import { ApiError } from "./errors.js";

declare global { namespace Express { interface Request { user?: { id: string; email: string; name: string | null; picture: string | null } } } }

export function getCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const i = part.indexOf("="); if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
}
export const SESSION_COOKIE = "mp_session";
export async function createSession(d: Db, userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await d.session.create({ data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + config.sessionTtlMs) } });
  return token;
}
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const token = getCookie(req, SESSION_COOKIE);
    if (!token) throw new ApiError(401, "Not authenticated");
    const s = await db.session.findUnique({ where: { id: sha256(token) }, include: { user: true } });
    if (!s || s.expiresAt < new Date()) throw new ApiError(401, "Session expired");
    req.user = { id: s.user.id, email: s.user.email, name: s.user.name, picture: s.user.picture };
    next();
  } catch (e) { next(e); }
}
// CSRF defence in depth (cookie is SameSite=Lax): reject cross-origin state-changing requests.
export function originCheck(req: Request, _res: Response, next: NextFunction) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const o = req.headers.origin;
  if (o && ![config.frontendUrl, config.backendUrl].includes(o)) return next(new ApiError(403, "Cross-origin request rejected"));
  next();
}

export function authRouter() {
  const r = Router();
  const fail = (res: Response, code: string) => res.redirect(`${config.frontendUrl}/login?error=${code}`);
  r.get("/google", (_req, res) => {
    if (!config.google.id || !config.google.secret) return fail(res, "google_not_configured");
    const state = randomBytes(16).toString("hex");
    res.cookie("mp_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: 600_000 });
    const q = new URLSearchParams({ client_id: config.google.id, redirect_uri: config.google.callback, response_type: "code", scope: "openid email profile", state, prompt: "select_account" });
    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${q}`);
  });
  r.get("/google/callback", async (req, res) => {
    const expected = getCookie(req, "mp_oauth_state"); res.clearCookie("mp_oauth_state");
    if (req.query.error) return fail(res, "access_denied");
    if (!req.query.code || !req.query.state || req.query.state !== expected) return fail(res, "invalid_state");
    try {
      const tr = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ code: String(req.query.code), client_id: config.google.id, client_secret: config.google.secret, redirect_uri: config.google.callback, grant_type: "authorization_code" }),
      });
      const tok = (await tr.json()) as { access_token?: string };
      if (!tr.ok || !tok.access_token) return fail(res, "token_exchange_failed");
      const ur = await fetch("https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } });
      const p = (await ur.json()) as { sub?: string; email?: string; email_verified?: boolean; name?: string; picture?: string };
      if (!ur.ok || !p.sub || !p.email || p.email_verified === false) return fail(res, "profile_failed");
      const user = await db.user.upsert({
        where: { googleId: p.sub }, create: { googleId: p.sub, email: p.email.toLowerCase(), name: p.name ?? null, picture: p.picture ?? null },
        update: { name: p.name ?? null, picture: p.picture ?? null },
      });
      const token = await createSession(db, user.id);
      res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: config.isProd, maxAge: config.sessionTtlMs });
      res.redirect(config.frontendUrl);
    } catch (e) { console.error("Google OAuth failed", (e as Error).message); fail(res, "server_error"); }
  });
  r.post("/logout", originCheck, async (req, res) => {
    const token = getCookie(req, SESSION_COOKIE);
    if (token) await db.session.deleteMany({ where: { id: sha256(token) } });
    res.clearCookie(SESSION_COOKIE); res.json({ ok: true });
  });
  return r;
}
