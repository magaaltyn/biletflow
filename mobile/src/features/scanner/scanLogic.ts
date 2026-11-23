// Pure scanner logic (no React Native imports) — unit-tested in tests/unit/scanLogic.test.ts.
import type { ScanResult } from "@/lib/types";

/**
 * The camera reports the same QR code many times per second. The gate lets a code through once,
 * blocks everything while a request is in flight, and ignores the same code again for `cooldownMs`
 * (so holding a ticket in front of the camera never sends a second check-in).
 */
export function createScanGate(cooldownMs = 3000, now: () => number = Date.now) {
  let busy = false;
  let last: { data: string; at: number } | null = null;
  return {
    /** Returns true if this scan should be sent to the server. */
    accept(data: string) {
      const value = data.trim();
      if (!value || busy) return false;
      if (last && last.data === value && now() - last.at < cooldownMs) return false;
      busy = true;
      last = { data: value, at: now() };
      return true;
    },
    /** Call when the server answered (or failed) and the result was shown. */
    release() {
      busy = false;
      if (last) last = { ...last, at: now() };
    },
    /** "Scan again" — allow the same code immediately (e.g. after a network error). */
    reset() {
      busy = false;
      last = null;
    },
    get busy() {
      return busy;
    },
  };
}

export type Tone = "success" | "warning" | "error";

/** Wording and colour for every server outcome (api/src/routes/checkin.ts). */
export const RESULT_INFO: Record<ScanResult | "network", { title: string; tone: Tone; admit: boolean }> = {
  valid: { title: "Valid ticket — checked in", tone: "success", admit: true },
  already_used: { title: "Ticket already checked in", tone: "warning", admit: false },
  cancelled: { title: "Ticket cancelled", tone: "error", admit: false },
  refunded: { title: "Ticket refunded", tone: "error", admit: false },
  wrong_event: { title: "Wrong event", tone: "error", admit: false },
  campaign_qr: { title: "This is a promotional QR code, not an admission ticket", tone: "error", admit: false },
  invalid: { title: "Invalid ticket", tone: "error", admit: false },
  network: { title: "Network error — not verified", tone: "error", admit: false },
};

export function describe(result: ScanResult | "network" | string) {
  return RESULT_INFO[result as ScanResult] ?? { title: "Invalid ticket", tone: "error" as Tone, admit: false };
}
