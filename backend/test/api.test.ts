import { describe, it, expect, beforeEach } from "vitest";
import request from "supertest";
import { createApp } from "../src/app";
import { db } from "../src/db";
import { makeUser, reset } from "./helpers";
const app = createApp();
beforeEach(reset);
const form = (r: request.Test, o: Record<string, string> = {}, file: string | null = "a@x.com\nb@x.com\nbad@\nA@X.com") => {
  const f = { name: "Launch", subject: "Hi", body: "Hello", startAt: "2030-01-01T10:00:00Z", delaySeconds: "30", hourlyLimit: "5", ...o };
  for (const [k, v] of Object.entries(f)) if (v !== undefined) r.field(k, v);
  if (file !== null) r.attach("recipients", Buffer.from(file), "r.csv");
  return r;
};
describe("auth & protected routes", () => {
  it("rejects unauthenticated API access", async () => { expect((await request(app).get("/api/stats")).status).toBe(401); });
  it("rejects unauthenticated Bull Board access", async () => { expect((await request(app).get("/admin/queues/")).status).toBe(401); });
  it("serves Bull Board to a signed-in user (dev mode)", async () => {
    const { cookie } = await makeUser(); expect((await request(app).get("/admin/queues/").set("Cookie", cookie)).status).toBe(200);
  });
  it("health reports db + redis up", async () => { const r = await request(app).get("/health"); expect(r.status).toBe(200); expect(r.body.database).toBe("up"); expect(r.body.redis).toBe("up"); });
  it("logout invalidates the session; cross-origin logout is blocked", async () => {
    const { cookie } = await makeUser();
    expect((await request(app).post("/auth/logout").set("Cookie", cookie).set("Origin", "http://evil.test")).status).toBe(403);
    expect((await request(app).get("/api/me").set("Cookie", cookie)).status).toBe(200);
    expect((await request(app).post("/auth/logout").set("Cookie", cookie)).status).toBe(200);
    expect((await request(app).get("/api/me").set("Cookie", cookie)).status).toBe(401);
  });
});
describe("Google OAuth flow (no external calls)", () => {
  it("redirects to Google with state + sets state cookie", async () => {
    const r = await request(app).get("/auth/google"); expect(r.status).toBe(302);
    expect(r.headers.location).toContain("https://accounts.google.com/o/oauth2/v2/auth"); expect(r.headers.location).toContain("redirect_uri=" + encodeURIComponent("http://localhost:4000/auth/google/callback"));
    expect(String(r.headers["set-cookie"])).toContain("mp_oauth_state");
  });
  it("handles user-denied consent", async () => { const r = await request(app).get("/auth/google/callback?error=access_denied"); expect(r.headers.location).toContain("/login?error=access_denied"); });
  it("rejects callback with mismatched/missing state (CSRF)", async () => {
    expect((await request(app).get("/auth/google/callback?code=x&state=bad")).headers.location).toContain("error=invalid_state");
    expect((await request(app).get("/auth/google/callback?code=x&state=bad").set("Cookie", "mp_oauth_state=other")).headers.location).toContain("error=invalid_state");
  });
});
describe("Slack OAuth routes", () => {
  it("requires login", async () => { expect((await request(app).get("/api/integrations/slack/connect")).status).toBe(401); });
  it("redirects to Slack with chat:write scope only", async () => {
    const { cookie } = await makeUser(); const r = await request(app).get("/api/integrations/slack/connect").set("Cookie", cookie);
    expect(r.headers.location).toContain("https://slack.com/oauth/v2/authorize"); expect(r.headers.location).toContain("scope=chat%3Awrite");
  });
  it("rejects callback with bad state and reports status", async () => {
    const { cookie } = await makeUser();
    expect((await request(app).get("/api/integrations/slack/callback?code=x&state=nope").set("Cookie", cookie)).headers.location).toContain("slack=invalid_state");
    const s = await request(app).get("/api/integrations").set("Cookie", cookie); expect(s.body.slack).toMatchObject({ configured: true, connected: false });
  });
});
describe("POST /api/campaigns", () => {
  it("creates campaign, recipients (spaced by delay), outbox rows; reports invalid rows", async () => {
    const { cookie } = await makeUser();
    const r = await form(request(app).post("/api/campaigns").set("Cookie", cookie));
    expect(r.status).toBe(201); expect(r.body.scheduled).toBe(2); expect(r.body.invalid.map((i: { reason: string }) => i.reason)).toEqual(["Malformed email address", "Duplicate"]);
    const recs = await db.recipient.findMany({ orderBy: { position: "asc" } });
    expect(recs[1].sendAt.getTime() - recs[0].sendAt.getTime()).toBe(30_000);
    expect(await db.outboxEvent.count()).toBe(2);
  });
  it("validates fields with helpful messages", async () => {
    const { cookie } = await makeUser();
    const r = await form(request(app).post("/api/campaigns").set("Cookie", cookie), { subject: "", hourlyLimit: "0" });
    expect(r.status).toBe(400); expect(r.body.errors.map((e: { field: string }) => e.field).sort()).toEqual(["hourlyLimit", "subject"]);
    expect(await db.campaign.count()).toBe(0);
  });
  it("rejects missing file, non-csv/txt file and files with no valid recipients", async () => {
    const { cookie } = await makeUser();
    expect((await form(request(app).post("/api/campaigns").set("Cookie", cookie), {}, null)).status).toBe(400);
    expect((await request(app).post("/api/campaigns").set("Cookie", cookie).field("name", "n").attach("recipients", Buffer.from("a@x.com"), "r.exe")).status).toBe(400);
    const r = await form(request(app).post("/api/campaigns").set("Cookie", cookie), {}, "bad\nworse@");
    expect(r.status).toBe(400); expect(r.body.invalid).toHaveLength(2);
  });
  it("is idempotent per Idempotency-Key (no duplicate campaign/recipients)", async () => {
    const { cookie } = await makeUser();
    const a = await form(request(app).post("/api/campaigns").set("Cookie", cookie).set("Idempotency-Key", "k1"));
    const b = await form(request(app).post("/api/campaigns").set("Cookie", cookie).set("Idempotency-Key", "k1"));
    expect(a.status).toBe(201); expect(b.status).toBe(200); expect(b.body).toMatchObject({ duplicate: true, campaignId: a.body.campaignId });
    expect(await db.campaign.count()).toBe(1); expect(await db.recipient.count()).toBe(2);
  });
  it("scopes data per user", async () => {
    const a = await makeUser("a@x.com"), b = await makeUser("b@x.com");
    await form(request(app).post("/api/campaigns").set("Cookie", a.cookie));
    expect((await request(app).get("/api/emails").set("Cookie", b.cookie)).body.total).toBe(0);
    expect((await request(app).get("/api/campaigns").set("Cookie", b.cookie)).body).toEqual([]);
    const mine = await request(app).get("/api/emails?status=scheduled").set("Cookie", a.cookie); expect(mine.body.total).toBe(2);
    expect((await request(app).get("/api/stats").set("Cookie", a.cookie)).body).toEqual({ scheduled: 2, pending: 0, sent: 0, failed: 0 });
    expect((await request(app).get("/api/emails?status=bogus").set("Cookie", a.cookie)).status).toBe(400);
  });
  it("preview endpoint returns counts before scheduling", async () => {
    const { cookie } = await makeUser();
    const r = await request(app).post("/api/recipients/preview").set("Cookie", cookie).attach("recipients", Buffer.from("a@x.com\nbad"), "r.txt");
    expect(r.body).toMatchObject({ validCount: 1, invalidCount: 1 });
  });
});
describe("search", () => {
  it("returns a friendly 503 when Elasticsearch is unreachable (real client, ES not running)", async () => {
    const { cookie } = await makeUser(); const r = await request(app).get("/api/search?q=hello").set("Cookie", cookie);
    expect(r.status).toBe(503); expect(r.body.error).toMatch(/temporarily unavailable/);
  });
});
