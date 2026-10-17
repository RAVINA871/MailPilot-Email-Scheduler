import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { useApi, type EmailRow, type Page } from "../api";
import { Badge, Empty, ErrorBox, Skeleton, btn2, fmt } from "../ui";
export function EmailTable({ items }: { items: Pick<EmailRow, "id" | "email" | "status" | "sendAt" | "sentAt" | "lastError" | "campaignName" | "subject" | "previewUrl">[] }) {
  return (<div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
    <table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>
      {["Recipient", "Subject", "Campaign", "Status", "Send at", "Sent at", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100">{items.map((r) => (<tr key={r.id}>
        <td className="px-4 py-3">{r.email}</td><td className="max-w-xs truncate px-4 py-3">{r.subject}</td><td className="px-4 py-3">{r.campaignName}</td>
        <td className="px-4 py-3"><Badge s={r.status} />{r.lastError && <p className="mt-1 max-w-xs truncate text-xs text-red-600" title={r.lastError}>{r.lastError}</p>}</td>
        <td className="whitespace-nowrap px-4 py-3">{fmt(r.sendAt)}</td><td className="whitespace-nowrap px-4 py-3">{fmt(r.sentAt)}</td>
        <td className="px-4 py-3">{r.previewUrl && <a className="text-emerald-700 underline" href={r.previewUrl} target="_blank" rel="noreferrer">Preview</a>}</td></tr>))}</tbody></table></div>);
}
export function Pager({ page, pageSize, total, set }: { page: number; pageSize: number; total: number; set: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (<div className="mt-4 flex items-center justify-between text-sm text-slate-600"><span>{total} total</span>
    <div className="flex items-center gap-2"><button className={btn2} disabled={page <= 1} onClick={() => set(page - 1)}>Previous</button><span>Page {page} / {pages}</span><button className={btn2} disabled={page >= pages} onClick={() => set(page + 1)}>Next</button></div></div>);
}
export default function Emails() {
  const { status = "scheduled" } = useParams(); const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [status]);
  const { data, error, loading, reload } = useApi<Page<EmailRow>>(`/api/emails?status=${status}&page=${page}&pageSize=20`);
  return (<div className="mx-auto max-w-6xl"><h1 className="mb-6 text-2xl font-semibold capitalize">{status} emails</h1>
    {error && <ErrorBox msg={error} retry={reload} />}
    {loading ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
      : data && data.items.length === 0 ? <Empty title={`No ${status} emails`} hint="Create a campaign to schedule emails." />
      : data && <><EmailTable items={data.items} /><Pager {...data} set={setPage} /></>}</div>);
}
