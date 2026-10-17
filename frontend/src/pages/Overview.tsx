import { Link } from "react-router-dom";
import { useApi } from "../api";
import { Card, ErrorBox, Skeleton } from "../ui";
export default function Overview() {
  const { data, error, loading, reload } = useApi<{ scheduled: number; pending: number; sent: number; failed: number }>("/api/stats");
  const cards = [["Scheduled", "scheduled", "text-sky-700"], ["Pending", "pending", "text-amber-700"], ["Sent", "sent", "text-emerald-700"], ["Failed", "failed", "text-red-700"]] as const;
  return (<div className="mx-auto max-w-5xl">
    <div className="mb-6 flex items-center justify-between"><h1 className="text-2xl font-semibold">Overview</h1><Link to="/compose" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">New campaign</Link></div>
    {error && <ErrorBox msg={error} retry={reload} />}
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map(([label, key, color]) => (<Link key={key} to={`/emails/${key}`}><Card className="transition hover:border-emerald-300">
        <p className="text-sm text-slate-500">{label}</p>{loading ? <Skeleton className="mt-2 h-8 w-16" /> : <p className={`mt-1 text-3xl font-semibold ${color}`}>{data?.[key] ?? 0}</p>}</Card></Link>))}
    </div>
    <p className="mt-6 text-sm text-slate-500">“Sent” means the SMTP server accepted the message — not that it reached an inbox.</p>
  </div>);
}
