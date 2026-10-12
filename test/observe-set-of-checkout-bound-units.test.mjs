import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkoutBoundExitCode,
  observeSetOfCheckoutBoundUnits,
} from "../src/observe-set-of-checkout-bound-units.mjs";

const ROOT = "/home/emsenn/info";

const UNIT_NAMES = [
  "bound-execstart.service",
  "bound-workingdirectory.service",
  "sibling-path.service",
  "verdaccio.service",
];

const LIST_UNITS_JSON = JSON.stringify(
  UNIT_NAMES.map((unit) => ({ unit, load: "loaded", active: "active", sub: "running" })),
);

const SHOW_OUTPUTS = {
  "bound-execstart.service": [
    "FragmentPath=/home/emsenn/.config/systemd/user/bound-execstart.service",
    "ExecStart={ path=/home/emsenn/info/lib/some-section/scripts/run.mjs ; argv[]=/usr/bin/node /home/emsenn/info/lib/some-section/scripts/run.mjs ; ignore_errors=no ; start_time=[not set] ; stop_time=[not set] ; pid=0 ; code=(null) ; status=0/0 }",
    "WorkingDirectory=[not set]",
    "ActiveState=active",
    "SubState=running",
  ].join("\n") + "\n",
  "bound-workingdirectory.service": [
    "FragmentPath=/home/emsenn/.config/systemd/user/bound-workingdirectory.service",
    "ExecStart={ path=/usr/bin/verdaccio ; argv[]=/usr/bin/verdaccio ; ignore_errors=no ; start_time=[not set] ; stop_time=[not set] ; pid=0 ; code=(null) ; status=0/0 }",
    "WorkingDirectory=/home/emsenn/info/lib/some-section",
    "ActiveState=active",
    "SubState=running",
  ].join("\n") + "\n",
  "sibling-path.service": [
    "FragmentPath=/home/emsenn/.config/systemd/user/sibling-path.service",
    "ExecStart={ path=/home/emsenn/info-old/scripts/run.mjs ; argv[]=/usr/bin/node /home/emsenn/info-old/scripts/run.mjs ; ignore_errors=no ; start_time=[not set] ; stop_time=[not set] ; pid=0 ; code=(null) ; status=0/0 }",
    "WorkingDirectory=/home/emsenn/info-old",
    "ActiveState=active",
    "SubState=running",
  ].join("\n") + "\n",
  "verdaccio.service": [
    "FragmentPath=/home/emsenn/.config/systemd/user/verdaccio.service",
    "ExecStart={ path=/usr/bin/verdaccio ; argv[]=/usr/bin/verdaccio ; ignore_errors=no ; start_time=[not set] ; stop_time=[not set] ; pid=0 ; code=(null) ; status=0/0 }",
    "WorkingDirectory=/home/emsenn/info/lib/verdaccio-services-section",
    "ActiveState=active",
    "SubState=running",
  ].join("\n") + "\n",
};

function fakeRun() {
  const calls = [];
  const run = (command, args) => {
    calls.push({ command, args });
    if (args.includes("list-units")) return LIST_UNITS_JSON;
    if (args.includes("list-timers")) return "[]";
    if (args.includes("list-unit-files")) return "[]";
    const unit = args[args.length - 1];
    return SHOW_OUTPUTS[unit] ?? "";
  };
  return { run, calls };
}

test("a unit whose ExecStart path is under root is bound", () => {
  const { run } = fakeRun();
  const result = observeSetOfCheckoutBoundUnits("local", { root: ROOT, run });
  const entry = result.bound.find((b) => b.unit === "bound-execstart.service");
  assert.ok(entry, "expected bound-execstart.service to be reported as bound");
  assert.equal(entry.allowed, false);
});

test("a unit whose WorkingDirectory is under root is bound", () => {
  const { run } = fakeRun();
  const result = observeSetOfCheckoutBoundUnits("local", { root: ROOT, run });
  const entry = result.bound.find((b) => b.unit === "bound-workingdirectory.service");
  assert.ok(entry, "expected bound-workingdirectory.service to be reported as bound");
});

test("a unit under a sibling path (e.g. /home/emsenn/info-old) is NOT bound", () => {
  const { run } = fakeRun();
  const result = observeSetOfCheckoutBoundUnits("local", { root: ROOT, run });
  const entry = result.bound.find((b) => b.unit === "sibling-path.service");
  assert.equal(entry, undefined, "sibling-path.service must not match root as a path prefix");
});

test("an allow-listed unit is still reported, with allowed true", () => {
  const { run } = fakeRun();
  const result = observeSetOfCheckoutBoundUnits("local", { root: ROOT, allow: ["verdaccio.service"], run });
  const entry = result.bound.find((b) => b.unit === "verdaccio.service");
  assert.ok(entry, "expected verdaccio.service to still be reported (never hidden)");
  assert.equal(entry.allowed, true);
  assert.deepEqual(result.allowed, ["verdaccio.service"]);
});

test("bound is sorted by unit name and observed counts every service unit seen", () => {
  const { run } = fakeRun();
  const result = observeSetOfCheckoutBoundUnits("local", { root: ROOT, run });
  const names = result.bound.map((b) => b.unit);
  assert.deepEqual(names, [...names].sort());
  assert.equal(result.observed, UNIT_NAMES.length);
  assert.equal(result.root, ROOT);
  assert.equal(result.kind, "systemd.checkout-bound-units");
});

test("missing root refuses with a TypeError naming the argument", () => {
  const { run } = fakeRun();
  assert.throws(() => observeSetOfCheckoutBoundUnits("local", { run }), (error) => {
    assert.ok(error instanceof TypeError);
    assert.match(error.message, /root/);
    return true;
  });
});

test("checkoutBoundExitCode is 0 when every bound unit is allowed", () => {
  const result = { bound: [{ unit: "a.service", allowed: true }, { unit: "b.service", allowed: true }] };
  assert.equal(checkoutBoundExitCode(result), 0);
});

test("checkoutBoundExitCode is 0 for no bound units at all", () => {
  assert.equal(checkoutBoundExitCode({ bound: [] }), 0);
});

test("checkoutBoundExitCode is 1 when any bound unit is not allowed", () => {
  const result = { bound: [{ unit: "a.service", allowed: true }, { unit: "b.service", allowed: false }] };
  assert.equal(checkoutBoundExitCode(result), 1);
});
