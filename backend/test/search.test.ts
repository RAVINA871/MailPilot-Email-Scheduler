import { describe, it, expect, beforeEach, vi } from "vitest";
import { buildQuery, searchEmails, indexRecipient, type EsLike } from "../src/search";
import { db } from "../src/db";
import { ApiError } from "../src/errors";
import { makeCampaign, makeUser, reset } from "./helpers";
beforeEach(reset);
// NOTE: these use a fake ES client (Elasticsearch is not installed in the dev sandbox). They verify query scoping
// and failure handling in our code, NOT Elasticsearch itself.
const fake = (over: Partial<EsLike> = {}): EsLike => ({ index: vi.fn(async () => ({})), search: vi.fn(async () => ({ hits: { total: { value: 1 }, hits: [{ _id: "1", _source: { subject: "s" } }] } })), indices: { exists: vi.fn(async () => true), create: vi.fn() }, ...over });
describe("search (fake ES client)", () => {
  it("always filters by the authenticated user and optional status", () => {
    const q = buildQuery("user-1", { q: "hello", status: "sent", page: 1, pageSize: 10 }) as { bool: { filter: unknown[] } };
    expect(q.bool.filter).toEqual([{ term: { userId: "user-1" } }, { term: { status: "SENT" } }]);
  });
  it("paginates and returns items", async () => {
    const c = fake(); const r = await searchEmails("u", { page: 3, pageSize: 10 }, c);
    expect(r.total).toBe(1); expect((c.search as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ from: 20, size: 10 });
  });
  it("maps ES outages to a 503 ApiError", async () => {
    await expect(searchEmails("u", { page: 1, pageSize: 10 }, fake({ search: vi.fn(async () => { throw new Error("ECONNREFUSED"); }) }))).rejects.toMatchObject({ status: 503 });
    await expect(searchEmails("u", { page: 1, pageSize: 10 }, fake({ search: vi.fn(async () => { throw new Error("x"); }) }))).rejects.toBeInstanceOf(ApiError);
  });
  it("indexes documents scoped by userId; surfaces ES failure so the queue retries", async () => {
    const { user } = await makeUser(); const { recipients } = await makeCampaign(user.id, ["a@x.com"]); const c = fake();
    await indexRecipient(db, recipients[0].id, c);
    expect((c.index as ReturnType<typeof vi.fn>).mock.calls[0][0]).toMatchObject({ id: recipients[0].id, document: { userId: user.id, recipientEmail: "a@x.com", subject: "Hello" } });
    await expect(indexRecipient(db, recipients[0].id, fake({ index: vi.fn(async () => { throw new Error("es down"); }) }))).rejects.toThrow("es down");
  });
});
