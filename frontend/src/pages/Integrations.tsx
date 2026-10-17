import { useEffect, useState } from "react";
import { api, useApi } from "../api";
import { Card, ErrorBox, Skeleton, btn, btn2, useToast } from "../ui";
interface Info { google: { connected: boolean; email: string }; slack: { configured: boolean; connected: boolean; team: string | null } }
const msgs: Record<string, [string, "ok" | "err"]> = { connected: ["Slack connected", "ok"], denied: ["Slack authorisation was cancelled", "err"], invalid_state: ["Slack connection expired — try again", "err"], error: ["Slack connection failed", "err"], not_configured: ["Slack is not configured on the server", "err"] };
export default function Integrations() {
  const { data, error, loading, reload } = useApi<Info>("/api/integrations"); const toast = useToast(); const [busy, setBusy] = useState(false);
  useEffect(() => { const s = new URLSearchParams(location.search).get("slack"); if (s && msgs[s]) { toast(...msgs[s]); history.replaceState(null, "", location.pathname); } }, []);
  const act = async (fn: () => Promise<unknown>, ok: string) => { setBusy(true); try { await fn(); toast(ok); reload(); } catch (e: any) { toast(e.message, "err"); } finally { setBusy(false); } };
  return (<div className="mx-auto max-w-3xl"><h1 className="mb-6 text-2xl font-semibold">Integrations</h1>
    {error && <ErrorBox msg={error} retry={reload} />}{loading && <Skeleton className="h-32" />}
    {data && <div className="space-y-4">
      <Card><div className="flex items-center justify-between"><div><h2 className="font-medium">Google</h2><p className="text-sm text-slate-500">Signed in as {data.google.email}</p></div><span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800">Connected</span></div></Card>
      <Card><h2 className="font-medium">Slack rate-limit alerts</h2>
        <p className="mt-1 text-sm text-slate-500">Get a direct message when a campaign reaches its hourly sending limit (at most once per campaign per hour).</p>
        {!data.slack.configured && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Slack isn’t configured on this server. Set SLACK_CLIENT_ID, SLACK_CLIENT_SECRET and the redirect URL (see README), then restart the backend.</p>}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {data.slack.connected ? <>
            <span className="text-sm text-emerald-700">Connected{data.slack.team ? ` to ${data.slack.team}` : ""}</span>
            <button disabled={busy} className={btn2} onClick={() => act(() => api("/api/integrations/slack/test", { method: "POST" }), "Test message sent")}>Send test</button>
            <button disabled={busy} className={btn2} onClick={() => act(() => api("/api/integrations/slack", { method: "DELETE" }), "Slack disconnected")}>Disconnect</button></>
            : <a href={data.slack.configured ? "/api/integrations/slack/connect" : undefined} aria-disabled={!data.slack.configured} className={`${btn} ${!data.slack.configured ? "pointer-events-none opacity-50" : ""}`}>Connect Slack</a>}
        </div></Card></div>}
  </div>);
}
