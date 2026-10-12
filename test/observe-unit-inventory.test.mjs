import { test } from "node:test";
import assert from "node:assert/strict";
import { assertValidHost, observeUnitInventory } from "../src/observe-unit-inventory.mjs";
import { runSystemctl } from "../src/run-systemctl.mjs";

test("accepts 'local'", () => {
  assert.equal(assertValidHost("local"), "local");
});

test("accepts a bare SSH destination", () => {
  assert.equal(assertValidHost("cold-red-gate"), "cold-red-gate");
});

test("refuses a host containing shell metacharacters", () => {
  assert.throws(() => assertValidHost("local; rm -rf /"));
});

test("refuses an empty host", () => {
  assert.throws(() => assertValidHost(""));
});

test("observes the local host's real systemd state", () => {
  const observation = observeUnitInventory("local", { run: runSystemctl });
  assert.equal(observation.host, "local");
  assert.ok(Array.isArray(observation.units));
  assert.ok(Array.isArray(observation.timers));
  assert.ok(observation.units.length > 0);
});
