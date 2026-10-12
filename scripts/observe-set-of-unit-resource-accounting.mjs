#!/usr/bin/env node
import { argument as option } from "@red-cup-engineering/javascript-node-services-section/argv";
import { observeSetOfUnitResourceAccounting } from "../src/observe-unit-resource-accounting.mjs";
import { serviceUnitNames } from "../src/observe-unit-inventory.mjs";
import { runSystemctl } from "../src/run-systemctl.mjs";

function collectRepeated(name, argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) values.push(argv[index + 1]);
  }
  return values;
}

const host = option("--host");
if (!host) {
  process.stderr.write(
    "usage: observe-set-of-unit-resource-accounting.mjs --host <local|ssh-destination> [--unit <name>]...\n" +
      "Without --unit, observes every unit named *.service in the host's live inventory.\n",
  );
  process.exit(2);
}

try {
  const explicitUnits = collectRepeated("--unit", process.argv);
  const units = explicitUnits.length > 0 ? explicitUnits : serviceUnitNames(host, { run: runSystemctl });
  process.stdout.write(`${JSON.stringify(observeSetOfUnitResourceAccounting(host, units, { run: runSystemctl }), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
