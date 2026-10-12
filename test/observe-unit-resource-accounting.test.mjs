import { test } from "node:test";
import assert from "node:assert/strict";
import {
  observeSetOfUnitResourceAccounting,
  observeUnitResourceAccounting,
  RESOURCE_ACCOUNTING_PROPERTIES,
} from "../src/observe-unit-resource-accounting.mjs";
// serviceUnitNames moved to observe-unit-inventory.mjs (it never read the clock the way this
// module's own two exports do -- see that file's header comment on the move).
import { serviceUnitNames } from "../src/observe-unit-inventory.mjs";

const SHOW_OUTPUT = [
  "Id=feed-arrivals.service",
  "CPUAccounting=yes",
  "MemoryAccounting=yes",
  "IPAccounting=no",
  "CPUUsageNSec=1465945000",
  "MemoryPeak=201564160",
  "MemoryCurrent=[not set]",
  "IPIngressBytes=[no data]",
  "IPEgressBytes=[no data]",
  "ActiveEnterTimestamp=Wed 2026-09-03 04:33:47 UTC",
  "ExecMainStartTimestamp=",
].join("\n") + "\n";

function fakeRun(calls, output) {
  return (command, args) => {
    calls.push({ command, args });
    return output;
  };
}

test("observeUnitResourceAccounting parses known and unknown properties without touching a real shell", () => {
  const calls = [];
  const row = observeUnitResourceAccounting("local", "feed-arrivals.service", { run: fakeRun(calls, SHOW_OUTPUT) });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    command: "systemctl",
    args: ["--user", "show", "-p", ["Id", "Names", ...RESOURCE_ACCOUNTING_PROPERTIES].join(","), "feed-arrivals.service"],
  });
  assert.equal(row.host, "local");
  assert.equal(row.unit, "feed-arrivals.service");
  assert.ok(typeof row.observedAt === "string" && row.observedAt.length > 0);
  assert.deepEqual(row.properties.CPUAccounting, { known: true, value: true });
  assert.deepEqual(row.properties.IPAccounting, { known: true, value: false });
  assert.deepEqual(row.properties.CPUUsageNSec, { known: true, value: "1465945000" });
  assert.deepEqual(row.properties.MemoryPeak, { known: true, value: "201564160" });
  assert.deepEqual(row.properties.MemoryCurrent, { known: false, value: null });
  assert.deepEqual(row.properties.IPIngressBytes, { known: false, value: null });
  assert.deepEqual(row.properties.IPEgressBytes, { known: false, value: null });
  assert.deepEqual(row.properties.ActiveEnterTimestamp, { known: true, value: "Wed 2026-09-03 04:33:47 UTC" });
  assert.deepEqual(row.properties.ExecMainStartTimestamp, { known: false, value: null });
});

test("observeUnitResourceAccounting routes through ssh for a non-local host", () => {
  const calls = [];
  observeUnitResourceAccounting("cold-red-gate", "feed-arrivals.service", { run: fakeRun(calls, SHOW_OUTPUT) });
  assert.equal(calls[0].command, "ssh");
  assert.deepEqual(calls[0].args.slice(0, 2), ["cold-red-gate", "systemctl"]);
});

test("observeUnitResourceAccounting reports [no data] and [not set] as unknown, never zero", () => {
  const calls = [];
  const row = observeUnitResourceAccounting("local", "idle.service", { run: fakeRun(calls, "Id=idle.service\nCPUUsageNSec=[not set]\nIPIngressBytes=[no data]\n") });
  assert.equal(row.properties.CPUUsageNSec.known, false);
  assert.equal(row.properties.CPUUsageNSec.value, null);
  assert.equal(row.properties.IPIngressBytes.known, false);
});

test("observeSetOfUnitResourceAccounting uses one identified show call and preserves input order and duplicates", () => {
  const calls = [];
  const output = `Id=a.service\nCPUUsageNSec=1\n\nId=b.service\nCPUUsageNSec=[no data]\n`;
  const rows = observeSetOfUnitResourceAccounting("local", ["b.service", "a.service", "b.service"], { run: fakeRun(calls, output) });
  assert.equal(rows.length, 3);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { command: "systemctl", args: ["--user", "show", "-p", ["Id", "Names", ...RESOURCE_ACCOUNTING_PROPERTIES].join(","), "b.service", "a.service"] });
  assert.equal(rows[0].properties.CPUUsageNSec.known, false);
  assert.equal(rows[1].properties.CPUUsageNSec.value, "1");
  assert.equal(rows[0].unit, "b.service");
  assert.equal(rows[1].unit, "a.service");
  assert.equal(rows[2].unit, "b.service");
});

test("observeSetOfUnitResourceAccounting associates reversed blocks by Id and leaves absent requested units unknown", () => {
  const rows = observeSetOfUnitResourceAccounting("local", ["a.service", "missing.service", "b.service"], { run: fakeRun([], "Id=b.service\nCPUUsageNSec=2\n\nId=a.service\nCPUUsageNSec=1\n") });
  assert.equal(rows[0].properties.CPUUsageNSec.value, "1");
  assert.deepEqual(rows[1].properties.CPUUsageNSec, { known: false, value: null });
  assert.equal(rows[2].properties.CPUUsageNSec.value, "2");
});

test("observeSetOfUnitResourceAccounting refuses an unidentified systemctl block", () => {
  assert.throws(() => observeSetOfUnitResourceAccounting("local", ["a.service"], { run: fakeRun([], "CPUUsageNSec=1\n") }), /no Id/u);
});

test("observeSetOfUnitResourceAccounting resolves a requested alias through Names", () => {
  const [row] = observeSetOfUnitResourceAccounting("local", ["alias.service"], { run: fakeRun([], "Id=canonical.service\nNames=canonical.service alias.service\nCPUUsageNSec=1\n") });
  assert.equal(row.unit, "alias.service"); assert.equal(row.properties.CPUUsageNSec.value, "1");
});

test("observeSetOfUnitResourceAccounting preserves systemctl's implicit service suffix", () => {
  const [row] = observeSetOfUnitResourceAccounting("local", ["metroplat"], { run: fakeRun([], "Id=metroplat.service\nCPUUsageNSec=1\n") });
  assert.equal(row.properties.CPUUsageNSec.value, "1");
});

test("serviceUnitNames filters list-units to *.service", () => {
  const listUnitsJson = JSON.stringify([
    { unit: "feed-arrivals.service", load: "loaded", active: "active", sub: "running" },
    { unit: "feed-arrivals.timer", load: "loaded", active: "active", sub: "waiting" },
    { unit: "metroplat.service", load: "loaded", active: "active", sub: "running" },
  ]);
  const run = (command, args) => (args.includes("list-units") ? listUnitsJson : "[]");
  const names = serviceUnitNames("local", { run });
  assert.deepEqual(names, ["feed-arrivals.service", "metroplat.service"]);
});

test("serviceUnitNames unions list-units with list-unit-files, including a static unloaded unit", () => {
  const listUnitsJson = JSON.stringify([
    { unit: "feed-arrivals.service", load: "loaded", active: "active", sub: "running" },
  ]);
  const listUnitFilesJson = JSON.stringify([
    { unit_file: "feed-arrivals.service", state: "enabled", preset: "enabled" },
    { unit_file: "scheduled-activity-delivery-run-due.service", state: "static", preset: null },
    { unit_file: "scheduled-activity-delivery-run-due.timer", state: "disabled", preset: "enabled" },
  ]);
  const run = (command, args) => {
    if (args.includes("list-units")) return listUnitsJson;
    if (args.includes("list-unit-files")) return listUnitFilesJson;
    return "[]";
  };
  const names = serviceUnitNames("local", { run });
  assert.deepEqual(names, ["feed-arrivals.service", "scheduled-activity-delivery-run-due.service"]);
});
