import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { api, ApiErr, type User } from "./api";
import { Skeleton, btn2 } from "./ui";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Compose from "./pages/Compose";
import Emails from "./pages/Emails";
import Search from "./pages/Search";
import Integrations from "./pages/Integrations";

const nav = [
  ["/", "Overview"], ["/compose", "New campaign"], ["/emails/scheduled", "Scheduled"], ["/emails/pending", "Pending"],
  ["/emails/sent", "Sent"], ["/emails/failed", "Failed"], ["/search", "Search"], ["/integrations", "Integrations"],
] as const;

export default function App() {
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [open, setOpen] = useState(false);
  useEffect(() => { api<User>("/api/me").then(setUser).catch((e) => { if (!(e instanceof ApiErr) || e.status !== 401) console.error(e); setUser(null); }); }, []);
  if (user === undefined) return <div className="mx-auto mt-24 w-64 space-y-3"><Skeleton className="h-8" /><Skeleton /></div>;
  if (!user) return <Routes><Route path="*" element={<Login />} /></Routes>;
  const logout = async () => { await api("/auth/logout", { method: "POST" }).catch(() => {}); setUser(null); };
  return (
    <div className="min-h-screen md:flex">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
        <span className="font-semibold text-emerald-700">MailPilot</span>
        <button aria-label="Toggle menu" className={btn2} onClick={() => setOpen(!open)}>Menu</button>
      </header>
      <aside className={`${open ? "block" : "hidden"} w-full shrink-0 border-r border-slate-200 bg-white md:sticky md:top-0 md:flex md:h-screen md:w-60 md:flex-col`}>
        <div className="hidden p-5 md:block"><p className="text-lg font-bold text-emerald-700">MailPilot</p><p className="text-xs text-slate-500">Precision Scheduling. Reliable Delivery.</p></div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {nav.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"} onClick={() => setOpen(false)}
              className={({ isActive }) => `block rounded-lg px-3 py-2 text-sm font-medium ${isActive ? "bg-emerald-50 text-emerald-700" : "text-slate-600 hover:bg-slate-100"}`}>{label}</NavLink>
          ))}
          <a href="/admin/queues" target="_blank" rel="noreferrer" className="block rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100">Queue monitor ↗</a>
        </nav>
        <div className="border-t border-slate-200 p-4">
          <div className="flex items-center gap-3">
            {user.picture ? <img src={user.picture} alt="" referrerPolicy="no-referrer" className="h-9 w-9 rounded-full" /> : <div className="grid h-9 w-9 place-items-center rounded-full bg-emerald-100 font-semibold text-emerald-700">{(user.name ?? user.email)[0].toUpperCase()}</div>}
            <div className="min-w-0"><p className="truncate text-sm font-medium">{user.name ?? "User"}</p><p className="truncate text-xs text-slate-500">{user.email}</p></div>
          </div>
          <button onClick={logout} className={`${btn2} mt-3 w-full`}>Log out</button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 p-4 sm:p-8">
        <Routes>
          <Route path="/" element={<Overview />} /><Route path="/compose" element={<Compose />} />
          <Route path="/emails/:status" element={<Emails />} /><Route path="/search" element={<Search />} />
          <Route path="/integrations" element={<Integrations />} /><Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
