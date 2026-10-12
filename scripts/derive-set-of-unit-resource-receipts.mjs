#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { argument as option } from "@red-cup-engineering/javascript-node-services-section/argv";
import { deriveSetOfUnitResourceReceipts } from "../src/derive-unit-resource-receipts.mjs";

function readObservations(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  return Array.isArray(parsed) ? parsed : [parsed];
}

const beforePath = option("--before");
const afterPath = option("--after");
if (!beforePath || !afterPath) {
  process.stderr.write(
    "usage: derive-set-of-unit-resource-receipts.mjs --before <observations.json> --after <observations.json>\n" +
      "Each file holds one observation object or a JSON array of them, per observe-set-of-unit-resource-accounting.mjs.\n",
  );
  process.exit(2);
}

try {
  const before = readObservations(beforePath);
  const after = readObservations(afterPath);
  process.stdout.write(`${JSON.stringify(deriveSetOfUnitResourceReceipts(before, after), null, 2)}\n`);
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
