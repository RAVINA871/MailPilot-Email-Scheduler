import { useMemo, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, ApiErr } from "../api";
import { Card, btn, btn2, input, useToast } from "../ui";
interface Preview { validCount: number; invalidCount: number; invalid: { row: number; value: string; reason: string }[]; sample: string[] }
const localISO = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
const Field = ({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) => (<label className="block"><span className="mb-1 block text-sm font-medium">{label}</span>{children}{hint && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}</label>);
export default function Compose() {
  const toast = useToast(); const nav = useNavigate(); const key = useRef(crypto.randomUUID());
  const [f, setF] = useState({ name: "", subject: "", body: "", startAt: localISO(new Date(Date.now() + 5 * 60000)), delaySeconds: "10", hourlyLimit: "50" });
  const [file, setFile] = useState<File | null>(null); const [pv, setPv] = useState<Preview | null>(null);
  const [errs, setErrs] = useState<string[]>([]); const [confirm, setConfirm] = useState(false); const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const eta = useMemo(() => pv ? Math.ceil(pv.validCount / Math.max(1, Number(f.hourlyLimit) || 1)) : 0, [pv, f.hourlyLimit]);
  const body = () => { const fd = new FormData(); Object.entries({ ...f, startAt: new Date(f.startAt).toISOString() }).forEach(([k, v]) => fd.append(k, v)); if (file) fd.append("recipients", file); return fd; };
  const pick = async (file: File | null) => {
    setFile(file); setPv(null); setErrs([]); if (!file) return;
    const fd = new FormData(); fd.append("recipients", file);
    try { setPv(await api<Preview>("/api/recipients/preview", { method: "POST", body: fd })); } catch (e: any) { setErrs([e.message]); }
  };
  const validate = (e: FormEvent) => { e.preventDefault(); const x: string[] = [];
    if (!f.name.trim()) x.push("Campaign name is required"); if (!f.subject.trim()) x.push("Subject is required"); if (!f.body.trim()) x.push("Email body is required");
    if (!file) x.push("Upload a CSV or TXT recipient file"); else if (pv && pv.validCount === 0) x.push("The file has no valid recipients");
    if (!(Number(f.hourlyLimit) >= 1)) x.push("Hourly limit must be at least 1"); if (!(Number(f.delaySeconds) >= 0)) x.push("Delay must be 0 or more");
    if (isNaN(new Date(f.startAt).getTime())) x.push("Start time is invalid");
    setErrs(x); if (!x.length) setConfirm(true); };
  const submit = async () => { setBusy(true); try {
      const r = await api<{ scheduled: number; invalidCount?: number }>("/api/campaigns", { method: "POST", body: body(), headers: { "Idempotency-Key": key.current } });
      toast(`Scheduled ${r.scheduled} emails`); nav("/emails/scheduled");
    } catch (e) { setConfirm(false); setErrs([(e as ApiErr).message]); toast("Could not schedule campaign", "err"); } finally { setBusy(false); } };
  return (<div className="mx-auto max-w-3xl"><h1 className="mb-6 text-2xl font-semibold">New campaign</h1>
    <form onSubmit={validate} noValidate><Card className="space-y-4">
      {errs.length > 0 && <ul role="alert" className="list-disc rounded-lg bg-red-50 p-3 pl-7 text-sm text-red-700">{errs.map((e) => <li key={e}>{e}</li>)}</ul>}
      <Field label="Campaign name"><input className={input} value={f.name} onChange={set("name")} maxLength={120} /></Field>
      <Field label="Subject"><input className={input} value={f.subject} onChange={set("subject")} maxLength={250} /></Field>
      <Field label="Email body"><textarea className={`${input} min-h-40`} value={f.body} onChange={set("body")} /></Field>
      <Field label="Recipients (.csv or .txt)" hint="One address per line, or comma-separated. Invalid and duplicate rows are skipped."><input type="file" accept=".csv,.txt,text/csv,text/plain" onChange={(e) => pick(e.target.files?.[0] ?? null)} className="block w-full text-sm" /></Field>
      {pv && <div className="rounded-lg bg-slate-50 p-3 text-sm"><p><b>{pv.validCount}</b> valid recipients{pv.invalidCount > 0 && <>, <b className="text-amber-700">{pv.invalidCount}</b> skipped</>}</p>
        {pv.invalid.length > 0 && <ul className="mt-2 max-h-32 overflow-auto text-xs text-slate-600">{pv.invalid.map((i, k) => <li key={k}>Row {i.row}: “{i.value}” — {i.reason}</li>)}</ul>}</div>}
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Start date & time"><input type="datetime-local" className={input} value={f.startAt} onChange={set("startAt")} /></Field>
        <Field label="Delay between emails (s)"><input type="number" min={0} className={input} value={f.delaySeconds} onChange={set("delaySeconds")} /></Field>
        <Field label="Max emails per hour"><input type="number" min={1} className={input} value={f.hourlyLimit} onChange={set("hourlyLimit")} /></Field></div>
      <button className={btn}>Review & schedule</button></Card></form>
    {confirm && <div className="fixed inset-0 z-40 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Confirm scheduling"><Card className="w-full max-w-md">
      <h2 className="text-lg font-semibold">Confirm scheduling</h2>
      <p className="mt-2 text-sm text-slate-600">Send <b>{pv?.validCount ?? "?"}</b> emails from <b>{new Date(f.startAt).toLocaleString()}</b>, {f.delaySeconds}s apart, max {f.hourlyLimit}/hour{eta > 1 ? ` (about ${eta} hours with the limit)` : ""}.</p>
      <div className="mt-5 flex justify-end gap-2"><button className={btn2} onClick={() => setConfirm(false)} disabled={busy}>Cancel</button><button className={btn} onClick={submit} disabled={busy}>{busy ? "Scheduling…" : "Schedule"}</button></div></Card></div>}
  </div>);
}
