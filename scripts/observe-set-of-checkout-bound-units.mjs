#!/usr/bin/env node
import { argument as option } from "@red-cup-engineering/javascript-node-services-section/argv";
import { checkoutBoundExitCode, observeSetOfCheckoutBoundUnits } from "../src/observe-set-of-checkout-bound-units.mjs";
import { runSystemctl } from "../src/run-systemctl.mjs";

function collectRepeated(name, argv) {
  const values = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === name) values.push(argv[index + 1]);
  }
  return values;
}

const host = option("--host");
const root = option("--root");
const allow = collectRepeated("--allow", process.argv);

if (!host) {
  process.stderr.write(
    "usage: observe-set-of-checkout-bound-units.mjs --host <local|ssh-destination> --root <dir> [--allow <unit>]...\n",
  );
  process.exit(2);
}

try {
  const result = observeSetOfCheckoutBoundUnits(host, { root, allow, run: runSystemctl });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(checkoutBoundExitCode(result));
} catch (error) {
  process.stdout.write(
    `${JSON.stringify({ kind: "systemd.checkout-bound-units.refusal", reason: error.message }, null, 2)}\n`,
  );
  process.exit(2);
}
