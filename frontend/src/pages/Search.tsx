import { useState, type FormEvent } from "react";
import { api, type EmailRow, type Page } from "../api";
import { Empty, ErrorBox, Skeleton, btn, input } from "../ui";
import { EmailTable, Pager } from "./Emails";
export default function Search() {
  const [q, setQ] = useState(""); const [status, setStatus] = useState(""); const [page, setPage] = useState(1);
  const [res, setRes] = useState<Page<any> | null>(null); const [err, setErr] = useState<string | null>(null); const [loading, setLoading] = useState(false);
  const run = (p = 1) => { setLoading(true); setErr(null); setPage(p);
    api<Page<any>>(`/api/search?${new URLSearchParams({ q, status, page: String(p), pageSize: "20" })}`).then(setRes).catch((e) => { setErr(e.message); setRes(null); }).finally(() => setLoading(false)); };
  const submit = (e: FormEvent) => { e.preventDefault(); run(1); };
  const rows: EmailRow[] = (res?.items ?? []).map((i) => ({ id: i.id, email: i.recipientEmail, status: i.status, sendAt: i.sendAt, sentAt: i.sentAt, lastError: i.lastError, campaignName: i.campaignName, subject: i.subject, previewUrl: i.previewUrl }));
  return (<div className="mx-auto max-w-6xl"><h1 className="mb-6 text-2xl font-semibold">Search emails</h1>
    <form onSubmit={submit} className="mb-6 flex flex-col gap-3 sm:flex-row">
      <input className={input} placeholder="Search subject, recipient, content…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search query" />
      <select className={`${input} sm:w-44`} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status filter"><option value="">All statuses</option><option value="scheduled">Scheduled</option><option value="sending">Sending</option><option value="sent">Sent</option><option value="failed">Failed</option></select>
      <button className={btn}>Search</button></form>
    {err && <ErrorBox msg={err} retry={() => run(page)} />}
    {loading ? <Skeleton className="h-32" /> : res && (res.items.length === 0 ? <Empty title="No matching emails" /> : <><EmailTable items={rows} /><Pager {...res} set={run} /></>)}
    {!res && !loading && !err && <Empty title="Search your emails" hint="Results come from the Elasticsearch index and only include your own emails." />}
  </div>);
}
