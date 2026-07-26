#!/usr/bin/env node
import { observeUnitInventory } from "../src/observe-unit-inventory.mjs";

function option(name) {
  const at = process.argv.indexOf(name);
  return at === -1 ? undefined : process.argv[at + 1];
}

const host = option("--host");
if (!host) {
  process.stderr.write("usage: observe-unit-inventory.mjs --host <local|ssh-destination>\n");
  process.exit(2);
}

try {
  process.stdout.write(JSON.stringify(observeUnitInventory(host), null, 2) + "\n");
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
