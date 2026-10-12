import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveSetOfUnitResourceReceipts, deriveUnitResourceReceipts } from "../src/derive-unit-resource-receipts.mjs";

function known(value) {
  return { known: true, value };
}
const unknown = Object.freeze({ known: false, value: null });

function observation({ host, unit, observedAt, cpuNsec, memoryPeak, ipIngress, ipEgress, activeEnterTimestamp }) {
  return {
    host,
    unit,
    observedAt,
    properties: {
      CPUAccounting: known(true),
      MemoryAccounting: known(true),
      IPAccounting: known(ipIngress !== undefined),
      CPUUsageNSec: cpuNsec === undefined ? unknown : known(cpuNsec),
      MemoryPeak: memoryPeak === undefined ? unknown : known(memoryPeak),
      MemoryCurrent: unknown,
      IPIngressBytes: ipIngress === undefined ? unknown : known(ipIngress),
      IPEgressBytes: ipEgress === undefined ? unknown : known(ipEgress),
      ActiveEnterTimestamp: activeEnterTimestamp === undefined ? unknown : known(activeEnterTimestamp),
      ExecMainStartTimestamp: unknown,
    },
  };
}

const INCARNATION = "Wed 2026-09-03 04:33:47 UTC";

test("deriveUnitResourceReceipts derives cpu-seconds, memory-peak-bytes, and network receipts", () => {
  const before = observation({
    host: "cold-red-gate", unit: "feed-arrivals.service", observedAt: "2026-09-03T05:00:00.000Z",
    cpuNsec: "1465945000", memoryPeak: "201564160", ipIngress: "1000", ipEgress: "500", activeEnterTimestamp: INCARNATION,
  });
  const after = observation({
    host: "cold-red-gate", unit: "feed-arrivals.service", observedAt: "2026-09-03T05:01:00.000Z",
    cpuNsec: "2465945000", memoryPeak: "301564160", ipIngress: "1500", ipEgress: "900", activeEnterTimestamp: INCARNATION,
  });
  const receipts = deriveUnitResourceReceipts(before, after);
  assert.equal(receipts.length, 4);

  const cpu = receipts.find((r) => r.price.denomination.asset === "cpu-seconds");
  assert.deepEqual(cpu.price, { denomination: { kind: "resource", asset: "cpu-seconds", unit: "second" }, amount: { numerator: "1000000000", denominator: "1000000000" } });
  assert.equal(cpu.provider, "cold-red-gate");
  assert.equal(cpu.actor, "feed-arrivals.service");
  assert.equal(cpu.intervalStart, before.observedAt);
  assert.equal(cpu.intervalEnd, after.observedAt);

  const memory = receipts.find((r) => r.price.denomination.asset === "memory-peak-bytes");
  assert.deepEqual(memory.price.amount, { numerator: "301564160", denominator: "1" });

  const ingress = receipts.find((r) => r.price.denomination.asset === "network-ingress-bytes");
  assert.deepEqual(ingress.price.amount, { numerator: "500", denominator: "1" });

  const egress = receipts.find((r) => r.price.denomination.asset === "network-egress-bytes");
  assert.deepEqual(egress.price.amount, { numerator: "400", denominator: "1" });
});

test("deriveUnitResourceReceipts skips a resource when either observation is unknown", () => {
  const before = observation({ host: "h", unit: "u.service", observedAt: "t0", cpuNsec: "100", activeEnterTimestamp: INCARNATION });
  const after = observation({ host: "h", unit: "u.service", observedAt: "t1", activeEnterTimestamp: INCARNATION }); // no cpuNsec, no memoryPeak
  const receipts = deriveUnitResourceReceipts(before, after);
  assert.equal(receipts.length, 0);
});

test("deriveUnitResourceReceipts skips cumulative-counter receipts across a unit restart", () => {
  const before = observation({ host: "h", unit: "u.service", observedAt: "t0", cpuNsec: "9999999", ipIngress: "500", activeEnterTimestamp: "incarnation-1" });
  const after = observation({ host: "h", unit: "u.service", observedAt: "t1", cpuNsec: "100", ipIngress: "10", memoryPeak: "1000", activeEnterTimestamp: "incarnation-2" });
  const receipts = deriveUnitResourceReceipts(before, after);
  // cpu and network receipts require the same incarnation; memory-peak is a snapshot and still derives.
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].price.denomination.asset, "memory-peak-bytes");
});

test("deriveUnitResourceReceipts throws when a counter runs backwards within one incarnation", () => {
  const before = observation({ host: "h", unit: "u.service", observedAt: "t0", cpuNsec: "1000", activeEnterTimestamp: INCARNATION });
  const after = observation({ host: "h", unit: "u.service", observedAt: "t1", cpuNsec: "500", activeEnterTimestamp: INCARNATION });
  assert.throws(() => deriveUnitResourceReceipts(before, after), /went backwards/);
});

test("deriveUnitResourceReceipts throws on a host/unit mismatch", () => {
  const before = observation({ host: "h1", unit: "u.service", observedAt: "t0" });
  const after = observation({ host: "h2", unit: "u.service", observedAt: "t1" });
  assert.throws(() => deriveUnitResourceReceipts(before, after), /host\/unit mismatch/);
});

test("deriveSetOfUnitResourceReceipts pairs by host+unit and ignores unmatched observations", () => {
  const beforeA = observation({ host: "h", unit: "a.service", observedAt: "t0", cpuNsec: "100", activeEnterTimestamp: INCARNATION });
  const afterA = observation({ host: "h", unit: "a.service", observedAt: "t1", cpuNsec: "200", activeEnterTimestamp: INCARNATION });
  const beforeOnly = observation({ host: "h", unit: "b.service", observedAt: "t0", cpuNsec: "1", activeEnterTimestamp: INCARNATION });
  const receipts = deriveSetOfUnitResourceReceipts([beforeA, beforeOnly], [afterA]);
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].unit, "a.service");
});

test("a receipt's price shape is exactly what derive-inference-pnl.mjs's accumulate() reads", () => {
  const before = observation({ host: "h", unit: "u.service", observedAt: "t0", cpuNsec: "0", activeEnterTimestamp: INCARNATION });
  const after = observation({ host: "h", unit: "u.service", observedAt: "t1", cpuNsec: "1000000000", activeEnterTimestamp: INCARNATION });
  const [receipt] = deriveUnitResourceReceipts(before, after);
  // Mirrors accumulate()'s own reads: event.price.denomination, event.price.amount.{numerator,denominator}, event.provider, event.actor.
  assert.equal(typeof receipt.price.denomination.kind, "string");
  assert.equal(typeof receipt.price.denomination.asset, "string");
  assert.equal(typeof receipt.price.denomination.unit, "string");
  assert.match(receipt.price.amount.numerator, /^-?[0-9]+$/);
  assert.match(receipt.price.amount.denominator, /^[1-9][0-9]*$/);
  assert.equal(typeof receipt.provider, "string");
  assert.equal(typeof receipt.actor, "string");
});
