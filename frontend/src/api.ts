import { useCallback, useEffect, useState } from "react";
export class ApiErr extends Error {
  constructor(public status: number, message: string, public body?: any) { super(message); }
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { credentials: "include", ...init, headers: { Accept: "application/json", ...(init.headers ?? {}) } });
  const data = await r.json().catch(() => null);
  if (!r.ok) {
    const detail = Array.isArray(data?.errors) ? data.errors.map((e: any) => e.message).join("; ") : "";
    throw new ApiErr(r.status, [data?.error ?? r.statusText, detail].filter(Boolean).join(": "), data);
  }
  return data as T;
}
export function useApi<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    if (!path) return;
    setLoading(true); setError(null);
    api<T>(path).then(setData).catch((e) => setError(e.message)).finally(() => setLoading(false));
  }, [path]);
  useEffect(load, [load]);
  return { data, error, loading, reload: load };
}
export interface User { id: string; email: string; name: string | null; picture: string | null }
export interface EmailRow { id: string; email: string; status: string; sendAt: string; sentAt: string | null; lastError: string | null; campaignName: string; subject: string; previewUrl: string | null }
export interface Page<T> { total: number; page: number; pageSize: number; items: T[] }
