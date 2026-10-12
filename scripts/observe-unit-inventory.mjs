#!/usr/bin/env node
import { argument as option } from "@red-cup-engineering/javascript-node-services-section/argv";
import { observeUnitInventory } from "../src/observe-unit-inventory.mjs";
import { runSystemctl } from "../src/run-systemctl.mjs";

const host = option("--host");
if (!host) {
  process.stderr.write("usage: observe-unit-inventory.mjs --host <local|ssh-destination>\n");
  process.exit(2);
}

try {
  process.stdout.write(JSON.stringify(observeUnitInventory(host, { run: runSystemctl }), null, 2) + "\n");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
