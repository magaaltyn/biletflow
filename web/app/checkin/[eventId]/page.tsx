"use client";
// Web check-in (SRS 4.8): camera QR scanning where the browser supports it, manual code entry and attendee search.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, ErrorBox, Input, Spinner, StatusBadge } from "@/components/ui";
import { api } from "@/lib/api";
import { useApi, useRequireUser } from "@/lib/hooks";

interface ScanResult {
  result: string;
  message?: string;
  ticket?: any;
  stats: { registered: number; checked_in: number };
}

const RESULT_STYLE: Record<string, { bg: string; title: string }> = {
  valid: { bg: "bg-green-600", title: "VALID — checked in" },
  already_used: { bg: "bg-amber-500", title: "ALREADY USED" },
  cancelled: { bg: "bg-red-600", title: "CANCELLED" },
  refunded: { bg: "bg-red-600", title: "REFUNDED" },
  wrong_event: { bg: "bg-red-600", title: "WRONG EVENT" },
  campaign_qr: { bg: "bg-red-600", title: "PROMO QR — NOT A TICKET" },
  invalid: { bg: "bg-red-600", title: "INVALID" },
};

declare global {
  interface Window {
    BarcodeDetector?: new (o: { formats: string[] }) => { detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]> };
  }
}

function Camera({ onCode }: { onCode: (code: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [on, setOn] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const last = useRef<{ code: string; at: number }>({ code: "", at: 0 });
  useEffect(() => {
    if (!on) return;
    if (!window.BarcodeDetector) {
      setErr("This browser cannot scan QR codes. Use Chrome on Android, the mobile app, or type the code.");
      setOn(false);
      return;
    }
    const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval>;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        stream = s;
        if (video.current) {
          video.current.srcObject = s;
          void video.current.play();
        }
        timer = setInterval(async () => {
          if (!video.current || video.current.readyState < 2) return;
          const codes = await detector.detect(video.current).catch(() => []);
          const code = codes[0]?.rawValue;
          // Ignore the same code for 3 seconds so one ticket is not submitted repeatedly.
          if (code && (code !== last.current.code || Date.now() - last.current.at > 3000)) {
            last.current = { code, at: Date.now() };
            onCode(code);
          }
        }, 400);
      })
      .catch(() => {
        setErr("Camera permission was denied.");
        setOn(false);
      });
    return () => {
      clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [on, onCode]);
  return (
    <div className="space-y-2">
      {on && <video ref={video} className="aspect-square w-full rounded-xl bg-black object-cover" muted playsInline />}
      <Button variant={on ? "secondary" : "primary"} className="w-full" onClick={() => { setErr(null); setOn(!on); }}>{on ? "Stop camera" : "Scan with camera"}</Button>
      {err && <p className="text-sm text-amber-700">{err}</p>}
    </div>
  );
}

export default function CheckinScreen() {
  const { eventId } = useParams<{ eventId: string }>();
  const { user } = useRequireUser();
  const { data: stats, setData: setStats, error } = useApi<{ registered: number; checked_in: number }>(user ? `/checkin/${eventId}/stats` : null);
  const [code, setCode] = useState("");
  const [result, setResult] = useState<ScanResult | null>(null);
  const [q, setQ] = useState("");
  const [found, setFound] = useState<any[]>([]);
  const [err, setErr] = useState<unknown>(null);

  const scan = useCallback(
    async (qr: string) => {
      setErr(null);
      try {
        const r = await api<ScanResult>(`/checkin/${eventId}/scan`, { body: { qr } });
        setResult(r);
        setStats(r.stats);
        if ("vibrate" in navigator) navigator.vibrate(r.result === "valid" ? 80 : [80, 60, 80]);
      } catch (e) {
        setErr(e);
      }
    },
    [eventId, setStats],
  );
  useEffect(() => {
    if (!user || q.trim().length < 2) {
      setFound([]);
      return;
    }
    const id = setTimeout(() => api<any[]>(`/checkin/${eventId}/search?q=${encodeURIComponent(q)}`).then(setFound).catch(setErr), 300);
    return () => clearTimeout(id);
  }, [q, eventId, user, result]);

  if (!user) return <Spinner />;
  if (error) return <div className="mx-auto max-w-md px-4 py-16"><ErrorBox error={error} /></div>;

  const manual = async (ticketId: number, undo = false) => {
    setErr(null);
    try {
      const r = await api<any>(`/checkin/${eventId}/tickets/${ticketId}${undo ? "/undo" : ""}`, { method: "POST" });
      setStats(r.stats);
      setResult(undo ? null : r);
      setQ((x) => x + "");
      setFound((list) => list.map((t) => (t.id === ticketId ? { ...t, status: undo ? "valid" : "checked_in" } : t)));
    } catch (e) {
      setErr(e);
    }
  };
  const style = result ? RESULT_STYLE[result.result] ?? RESULT_STYLE.invalid : null;

  return (
    <div className="mx-auto max-w-md space-y-4 px-4 py-6">
      <Link href="/checkin" className="text-sm text-muted">← Events</Link>
      <Card className="flex items-center justify-around text-center">
        <div><p className="text-xs text-muted">Checked in</p><p className="text-3xl font-extrabold text-brand">{stats?.checked_in ?? "—"}</p></div>
        <div><p className="text-xs text-muted">Registered</p><p className="text-3xl font-extrabold">{stats?.registered ?? "—"}</p></div>
      </Card>
      {result && style && (
        <div className={`rounded-2xl p-5 text-white ${style.bg}`} role="status" aria-live="assertive">
          <p className="text-2xl font-extrabold">{style.title}</p>
          {result.message && <p className="mt-1 text-sm opacity-90">{result.message}</p>}
          {result.ticket && (
            <div className="mt-3 text-sm">
              <p className="text-lg font-bold">{result.ticket.attendee_name}</p>
              <p>{result.ticket.ticket_type}{result.ticket.section_code ? ` · ${result.ticket.section_code}-${result.ticket.row_label}-${result.ticket.seat_number}` : ""}</p>
              <p className="font-mono text-xs opacity-80">{result.ticket.code}</p>
              {result.result === "valid" && <button className="mt-2 font-semibold underline" onClick={() => manual(result.ticket.id, true)}>Undo check-in</button>}
            </div>
          )}
        </div>
      )}
      <Card className="space-y-3">
        <Camera onCode={scan} />
        <form onSubmit={(e) => { e.preventDefault(); if (code.trim()) void scan(code.trim()); setCode(""); }} className="flex gap-2">
          <Input placeholder="Or paste the QR text (BFT1.…)" value={code} onChange={(e) => setCode(e.target.value)} aria-label="QR code text" />
          <Button type="submit">Check</Button>
        </form>
      </Card>
      <ErrorBox error={err} />
      <Card className="space-y-2">
        <p className="font-bold">Find attendee</p>
        <Input placeholder="Name, email or ticket ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search attendees" />
        <ul className="divide-y divide-line">
          {found.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div>
                <p className="font-semibold">{t.attendee_name}</p>
                <p className="text-xs text-muted">{t.ticket_type} · {t.code}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={t.status} />
                {t.status === "valid" && <Button className="min-h-8 px-3 py-1" onClick={() => manual(t.id)}>Check in</Button>}
                {t.status === "checked_in" && <button className="text-xs font-semibold text-brand" onClick={() => manual(t.id, true)}>Undo</button>}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
