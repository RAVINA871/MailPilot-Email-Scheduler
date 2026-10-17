import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "../src/db";
import { connection } from "../src/queue";
import { encrypt } from "../src/crypto";
import { notifyRateLimit } from "../src/slack";
import { makeCampaign, makeUser, reset } from "./helpers";
beforeEach(reset); afterEach(() => vi.unstubAllGlobals());
const setup = async (connected: boolean) => {
  const { user } = await makeUser(); const { campaign } = await makeCampaign(user.id, ["a@x.com"], { hourlyLimit: 3 });
  if (connected) await db.integration.create({ data: { userId: user.id, provider: "SLACK", encryptedToken: encrypt("xoxb-token"), channelId: "U123", teamName: "T" } });
  return { campaign: { id: campaign.id, name: campaign.name, userId: user.id, hourlyLimit: 3 }, resumeAt: new Date(Date.now() + 1000) };
};
describe("Slack notifications", () => {
  it("does nothing (and says so) when Slack is not connected", async () => {
    const f = vi.fn(); vi.stubGlobal("fetch", f); const r = await notifyRateLimit(db, connection, await setup(false));
    expect(r).toEqual({ sent: false, reason: "slack_not_connected" }); expect(f).not.toHaveBeenCalled();
  });
  it("posts once, then throttles duplicates within the same hour", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: true }))); vi.stubGlobal("fetch", f); const n = await setup(true);
    expect((await notifyRateLimit(db, connection, n)).sent).toBe(true); expect((await notifyRateLimit(db, connection, n))).toEqual({ sent: false, reason: "throttled" });
    expect(f).toHaveBeenCalledTimes(1); const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://slack.com/api/chat.postMessage"); expect((init.headers as Record<string, string>).Authorization).toBe("Bearer xoxb-token");
    expect(JSON.parse(init.body as string)).toMatchObject({ channel: "U123" }); expect(init.body as string).toContain("hourly limit of 3");
  });
  it("handles Slack API errors without throwing and allows a retry", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "invalid_auth" }))); vi.stubGlobal("fetch", f); const n = await setup(true);
    const r = await notifyRateLimit(db, connection, n); expect(r.sent).toBe(false); expect(r.reason).toContain("invalid_auth");
    await notifyRateLimit(db, connection, n); expect(f).toHaveBeenCalledTimes(2);
  });
  it("handles network failure without throwing", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("ECONNRESET"); })); const r = await notifyRateLimit(db, connection, await setup(true));
    expect(r.sent).toBe(false); expect(r.reason).toContain("ECONNRESET");
  });
});
