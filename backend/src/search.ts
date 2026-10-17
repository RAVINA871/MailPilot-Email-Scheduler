import { Client } from "@elastic/elasticsearch";
import type { Db } from "./db.js";
import { config } from "./config.js";
import { ApiError } from "./errors.js";
export const INDEX = "mailpilot-emails";
export const es = new Client({ node: config.esUrl, requestTimeout: 5000, maxRetries: 1 });
/* eslint-disable @typescript-eslint/no-explicit-any */
export interface EsLike {
  index(p: any): Promise<unknown>;
  search(p: any): Promise<any>;
  indices: { exists(p: any): Promise<any>; create(p: any): Promise<any> };
}

let ensured = false;
export async function ensureIndex(c: EsLike = es) {
  if (ensured) return;
  const exists = await c.indices.exists({ index: INDEX });
  if (!exists) await c.indices.create({ index: INDEX, mappings: { properties: {
    userId: { type: "keyword" }, campaignId: { type: "keyword" }, status: { type: "keyword" },
    campaignName: { type: "text" }, recipientEmail: { type: "text", fields: { raw: { type: "keyword" } } },
    subject: { type: "text" }, body: { type: "text" }, sendAt: { type: "date" }, sentAt: { type: "date" }, lastError: { type: "text" }, previewUrl: { type: "keyword", index: false },
  } } }).catch((e) => { if (!String(e?.message).includes("resource_already_exists")) throw e; });
  ensured = true;
}
// Throws on ES failure so BullMQ retries with backoff.
export async function indexRecipient(db: Db, recipientId: string, c: EsLike = es) {
  const r = await db.recipient.findUnique({ where: { id: recipientId }, include: { campaign: true, attempts: { where: { ok: true }, orderBy: { createdAt: "desc" }, take: 1 } } });
  if (!r) return;
  await ensureIndex(c);
  await c.index({ index: INDEX, id: r.id, document: {
    userId: r.campaign.userId, campaignId: r.campaignId, campaignName: r.campaign.name, recipientEmail: r.email,
    subject: r.campaign.subject, body: r.campaign.body, status: r.status, sendAt: r.sendAt, sentAt: r.sentAt, lastError: r.lastError, previewUrl: r.attempts[0]?.previewUrl ?? null,
  } });
}
export interface SearchParams { q?: string; status?: string; page: number; pageSize: number }
export function buildQuery(userId: string, p: SearchParams) {
  const filter: object[] = [{ term: { userId } }]; // always scoped to the caller
  if (p.status) filter.push({ term: { status: p.status.toUpperCase() } });
  const must = p.q ? [{ multi_match: { query: p.q, fields: ["subject^2", "recipientEmail", "recipientEmail.raw", "body", "campaignName", "lastError"], fuzziness: "AUTO" } }] : [{ match_all: {} }];
  return { bool: { filter, must } };
}
export async function searchEmails(userId: string, p: SearchParams, c: EsLike = es) {
  try {
    await ensureIndex(c);
    const r = await c.search({ index: INDEX, from: (p.page - 1) * p.pageSize, size: p.pageSize, sort: [{ sendAt: "desc" }], query: buildQuery(userId, p) });
    const total = typeof r.hits.total === "number" ? r.hits.total : r.hits.total?.value ?? 0;
    return { total, page: p.page, pageSize: p.pageSize, items: r.hits.hits.map((h: { _id: string; _source?: unknown }) => ({ id: h._id, ...(h._source as object) })) };
  } catch (e) {
    console.error("Elasticsearch search failed:", (e as Error).message);
    throw new ApiError(503, "Search is temporarily unavailable. Please try again shortly.");
  }
}
