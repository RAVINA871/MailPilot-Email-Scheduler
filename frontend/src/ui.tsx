import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
type Toast = { id: number; msg: string; kind: "ok" | "err" };
const Ctx = createContext<(msg: string, kind?: "ok" | "err") => void>(() => {});
export const useToast = () => useContext(Ctx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const push = useCallback((msg: string, kind: "ok" | "err" = "ok") => {
    const id = Date.now() + Math.random(); setList((l) => [...l, { id, msg, kind }]);
    setTimeout(() => setList((l) => l.filter((t) => t.id !== id)), 5000);
  }, []);
  return (<Ctx.Provider value={push}>{children}
    <div className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2" role="status" aria-live="polite">
      {list.map((t) => <div key={t.id} className={`rounded-lg px-4 py-3 text-sm shadow-lg ${t.kind === "ok" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}>{t.msg}</div>)}
    </div></Ctx.Provider>);
}
export const Skeleton = ({ className = "h-5 w-full" }: { className?: string }) => <div className={`animate-pulse rounded bg-slate-200 ${className}`} />;
export const Empty = ({ title, hint }: { title: string; hint?: string }) => (
  <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center"><p className="font-medium text-slate-700">{title}</p>{hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}</div>);
export const ErrorBox = ({ msg, retry }: { msg: string; retry?: () => void }) => (
  <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">{msg}{retry && <button onClick={retry} className="ml-3 font-medium underline">Retry</button>}</div>);
export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ${className}`}>{children}</div>;
export const btn = "inline-flex items-center justify-center rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";
export const btn2 = "inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50";
export const input = "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500";
const colors: Record<string, string> = { SENT: "bg-emerald-100 text-emerald-800", FAILED: "bg-red-100 text-red-800", SENDING: "bg-amber-100 text-amber-800", SCHEDULED: "bg-sky-100 text-sky-800", PENDING: "bg-amber-100 text-amber-800" };
export const Badge = ({ s }: { s: string }) => <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[s] ?? "bg-slate-100 text-slate-700"}`}>{s.toLowerCase()}</span>;
export const fmt = (d: string | null) => (d ? new Date(d).toLocaleString() : "—");
