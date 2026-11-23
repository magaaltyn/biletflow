/// <reference types="jest" />
import { createScanGate, describe as describeResult, RESULT_INFO } from "../../src/features/scanner/scanLogic";

describe("scan gate (debouncing continuous camera scans)", () => {
  test("lets the first scan through and blocks while the request is in flight", () => {
    let t = 0;
    const gate = createScanGate(3000, () => t);
    expect(gate.accept("BFT1.A.sig")).toBe(true);
    expect(gate.busy).toBe(true);
    expect(gate.accept("BFT1.B.sig")).toBe(false); // another code while busy
    expect(gate.accept("BFT1.A.sig")).toBe(false);
  });

  test("ignores the same code during the cooldown after the answer", () => {
    let t = 0;
    const gate = createScanGate(3000, () => t);
    gate.accept("X");
    t = 500;
    gate.release();
    t = 2000;
    expect(gate.accept("X")).toBe(false); // camera still sees the same ticket
    t = 3600;
    expect(gate.accept("X")).toBe(true); // cooldown passed
  });

  test("a different code is accepted right after the answer", () => {
    let t = 0;
    const gate = createScanGate(3000, () => t);
    gate.accept("X");
    gate.release();
    t = 10;
    expect(gate.accept("Y")).toBe(true);
  });

  test("reset allows rescanning the same code immediately (Scan again / retry)", () => {
    let t = 0;
    const gate = createScanGate(3000, () => t);
    gate.accept("X");
    gate.reset();
    expect(gate.accept("X")).toBe(true);
  });

  test("empty payloads are ignored", () => {
    const gate = createScanGate();
    expect(gate.accept("   ")).toBe(false);
  });

  test("rapid repeated scans of one code produce a single request", () => {
    let t = 0;
    const gate = createScanGate(3000, () => t);
    let sent = 0;
    for (let i = 0; i < 30; i++) {
      t = i * 33; // ~30 frames per second for one second
      if (gate.accept("SAME")) sent++;
      if (i === 5) gate.release(); // server answered after ~165 ms
    }
    expect(sent).toBe(1);
  });
});

describe("scan result wording", () => {
  test("every server outcome has a message; only 'valid' admits", () => {
    for (const r of ["valid", "already_used", "cancelled", "refunded", "wrong_event", "campaign_qr", "invalid", "network"] as const) {
      expect(RESULT_INFO[r].title.length).toBeGreaterThan(3);
      expect(RESULT_INFO[r].admit).toBe(r === "valid");
    }
    expect(describeResult("campaign_qr").title).toMatch(/promotional/i);
    expect(describeResult("already_used").title).toBe("Ticket already checked in");
    expect(describeResult("refunded").title).toBe("Ticket refunded");
    expect(describeResult("cancelled").title).toBe("Ticket cancelled");
    expect(describeResult("invalid").title).toBe("Invalid ticket");
  });

  test("unknown results are treated as invalid, never as admitted", () => {
    expect(describeResult("something_new")).toMatchObject({ admit: false, tone: "error" });
  });
});
