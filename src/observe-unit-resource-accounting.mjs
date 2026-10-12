import { invokeSystemctlUser } from "./observe-unit-inventory.mjs";

/**
 * The systemd properties this die reads for resource-accounting metering.
 * Property names are systemd's own vocabulary, unchanged, so a consumer can
 * cross-reference `systemctl show` documentation directly.
 */
export const RESOURCE_ACCOUNTING_PROPERTIES = Object.freeze([
  "CPUAccounting",
  "MemoryAccounting",
  "IPAccounting",
  "CPUUsageNSec",
  "MemoryPeak",
  "MemoryCurrent",
  "IPIngressBytes",
  "IPEgressBytes",
  "ActiveEnterTimestamp",
  "ExecMainStartTimestamp",
]);

const UNKNOWN_TOKENS = new Set(["[no data]", "[not set]", ""]);
const BOOLEAN_PROPERTIES = new Set(["CPUAccounting", "MemoryAccounting", "IPAccounting"]);

function parseShowOutput(text) {
  const properties = {};
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    properties[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return properties;
}

function parseShowBlocks(text) {
  return text.split(/\n\s*\n/u).filter((block) => block.trim().length > 0).map((block) => {
    const parsed = parseShowOutput(block);
    if (typeof parsed.Id !== "string" || parsed.Id.length === 0) throw new Error("systemctl show batch block has no Id");
    return parsed;
  });
}

function accountingRow(host, unit, raw, observedAt) {
  const properties = {};
  for (const name of RESOURCE_ACCOUNTING_PROPERTIES) properties[name] = typedProperty(name, raw[name]);
  return Object.freeze({ host, unit, observedAt, properties: Object.freeze(properties) });
}

function blockForUnit(blocks, unit) {
  const normalized = unit.endsWith(".service") ? unit : `${unit}.service`;
  const matches = blocks.filter((block) => block.Id === unit || block.Id === normalized || block.Names?.split(" ").includes(unit) || block.Names?.split(" ").includes(normalized));
  if (matches.length > 1) throw new Error(`systemctl show batch has ambiguous blocks for ${unit}`);
  return matches[0] ?? {};
}

// House rule: absence of evidence is unknown, never zero/false. systemd
// spells that absence "[no data]" (accounting off) or "[not set]" (never
// populated); an empty timestamp string means the same thing for a unit
// that has never entered the active state.
function typedProperty(name, raw) {
  if (raw === undefined || UNKNOWN_TOKENS.has(raw)) return Object.freeze({ known: false, value: null });
  if (BOOLEAN_PROPERTIES.has(name)) {
    if (raw === "yes") return Object.freeze({ known: true, value: true });
    if (raw === "no") return Object.freeze({ known: true, value: false });
    return Object.freeze({ known: false, value: null });
  }
  return Object.freeze({ known: true, value: raw });
}

/**
 * Read-only resource-accounting properties for one unit on one host.
 * Cumulative counters (CPUUsageNSec, IPIngressBytes, IPEgressBytes) and the
 * MemoryPeak high-water mark are reported as decimal-string values, never
 * JS numbers, so no precision is lost differencing two observations later.
 * @param {string} host - "local" or a bare SSH destination.
 * @param {string} unit - a systemd unit name (e.g. "feed-arrivals.service").
 * @param {{run?: (command: string, args: string[]) => string}} [options]
 * @returns {{host: string, unit: string, observedAt: string, properties: Record<string, {known: boolean, value: string|boolean|null}>}}
 */
export function observeUnitResourceAccounting(host, unit, { run } = {}) {
  const text = invokeSystemctlUser(host, ["show", "-p", ["Id", "Names", ...RESOURCE_ACCOUNTING_PROPERTIES].join(","), unit], { run });
  const raw = blockForUnit(parseShowBlocks(text), unit);
  return accountingRow(host, unit, raw, new Date().toISOString());
}

/**
 * Resource-accounting properties for a set of units on one host, one
 * one identified `systemctl show` invocation, retaining requested order.
 * @param {string} host
 * @param {string[]} units
 * @param {{run?: (command: string, args: string[]) => string}} [options]
 * @returns {ReturnType<typeof observeUnitResourceAccounting>[]}
 */
export function observeSetOfUnitResourceAccounting(host, units, { run } = {}) {
  if (units.length === 0) return [];
  const requested = [...new Set(units)];
  const text = invokeSystemctlUser(host, ["show", "-p", ["Id", "Names", ...RESOURCE_ACCOUNTING_PROPERTIES].join(","), ...requested], { run });
  const blocks = parseShowBlocks(text);
  const observedAt = new Date().toISOString();
  return units.map((unit) => {
    const raw = blockForUnit(blocks, unit);
    return accountingRow(host, unit, raw, observedAt);
  });
}
