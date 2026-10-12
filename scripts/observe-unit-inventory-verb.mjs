// observe-unit-inventory-verb — this package's read-only unit/timer observation as a plain verbs
// module: its named export is the verb function, carrying a `.spec` ({args, returns, refusal})
// and an `.effects` array — the shape computer-system-engine's generic stdio verb server
// (scripts/serve-verbs-over-stdio.mjs) loads with
// `--verbs @red-cup-engineering/systemd-unit-inventory-observation-service/observe-unit-inventory-verb`.
// Invents and ports nothing: the handler is a direct call to this package's own
// observeUnitInventory, bound to its own real `run` (run-systemctl.mjs's runSystemctl — this
// package's one irreducible effect; every other export here is a required, no-default `run` away
// from pure, and this is the kernel edge that supplies it).
//
// Formerly declared inline in computer-deployment-engine's former composite worker script ("Unit/timer
// inventory through the process authority: production uses a read-only systemd --user observer")
// — this package owns the observation, so this is where its verb contract now lives.

import { observeUnitInventory } from "../src/observe-unit-inventory.mjs";
import { runSystemctl } from "../src/run-systemctl.mjs";
import { REFUSAL_SCHEMA } from "@red-cup-engineering/computer-system-engine/verb-refusal-schema";

function observeUnitInventoryVerb({ host }) {
  return observeUnitInventory(host ?? "local", { run: runSystemctl });
}
observeUnitInventoryVerb.spec = {
  args: { type: "object", properties: { host: { type: "string" } }, required: [] },
  returns: {
    type: "object",
    properties: { host: { type: "string" }, units: { type: "array" }, timers: { type: "array" } },
    required: ["host", "units", "timers"],
  },
  refusal: REFUSAL_SCHEMA,
};
observeUnitInventoryVerb.effects = ["process:execute"];

export { observeUnitInventoryVerb as "observe-unit-inventory" };
