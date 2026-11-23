"use client";
import { api } from "./api";

declare global {
  interface Window {
    halyk?: { pay: (paymentObject: unknown) => void };
  }
}

function loadScript(src: string) {
  return new Promise<void>((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Could not load the Halyk ePay payment page"));
    document.head.appendChild(s);
  });
}

/**
 * Starts a payment. DEMO payments open BiletFlow's simulated payment page;
 * Halyk ePay payments open the bank's test payment page (redirects back to `backLink`).
 */
export async function startPayment(path: string, provider: "demo" | "halyk") {
  const res = await api<{ paymentId: number; provider: string; paymentObject?: unknown; script?: string }>(path, { body: { provider } });
  if (res.provider === "halyk" && res.script && res.paymentObject) {
    await loadScript(res.script);
    if (!window.halyk) throw new Error("Halyk ePay is not available right now");
    window.halyk.pay(res.paymentObject);
    return;
  }
  window.location.href = `/pay/${res.paymentId}`;
}
