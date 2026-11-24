import path from "node:path";
import { assertValidHost, invokeSystemctlUser, serviceUnitNames } from "./observe-unit-inventory.mjs";

const SHOW_PROPERTIES = ["FragmentPath", "ExecStart", "WorkingDirectory", "ActiveState", "SubState"];

function parseShowOutput(text) {
  const properties = {};
  for (const line of text.split("\n")) {
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    properties[line.slice(0, eq)] = line.slice(eq + 1);
  }
  return properties;
}

// POSIX filename characters that continue a path component. A boundary is
// anywhere else (string edge, "/", punctuation, whitespace) -- this is what
// keeps a sibling directory like "/home/emsenn/info-old" from matching root
// "/home/emsenn/info": the character right after the candidate match ("-")
// continues the component, so it is not a boundary and the match is rejected.
const PATH_CONTINUATION = /[A-Za-z0-9._-]/u;

function isPathBoundary(char) {
  return char === undefined || !PATH_CONTINUATION.test(char);
}

/**
 * True when `root` (an absolute, resolved path) occurs inside `text` as a
 * whole path-component prefix rather than merely a textual prefix.
 * @param {string|undefined} text
 * @param {string} root
 * @returns {boolean}
 */
function containsPathPrefix(text, root) {
  if (!text) return false;
  let from = 0;
  for (;;) {
    const index = text.indexOf(root, from);
    if (index === -1) return false;
    if (isPathBoundary(text[index - 1]) && isPathBoundary(text[index + root.length])) return true;
    from = index + 1;
  }
}

/**
 * Decides the CLI exit code for one observeSetOfCheckoutBoundUnits result:
 * 0 when every checkout-bound unit is allow-listed, 1 when at least one is
 * not.
 * @param {ReturnType<typeof observeSetOfCheckoutBoundUnits>} result
 * @returns {0|1}
 */
export function checkoutBoundExitCode(result) {
  return result.bound.some((entry) => !entry.allowed) ? 1 : 0;
}

/**
 * Observes which of a host's service units execute from inside a given
 * directory tree -- the "checkout is not a runtime" law: a unit whose
 * ExecStart or WorkingDirectory points into a git checkout is the disease;
 * the only lawful exceptions on the dev box are development infrastructure.
 * One `systemctl show` call per service unit named by serviceUnitNames.
 * @param {string} host - "local" or a bare SSH destination.
 * @param {{root: string, allow?: string[], run?: (command: string, args: string[]) => string}} options -
 *   `root` is required (the checkout directory to test against, resolved to
 *   an absolute path before matching); `allow` names units that are still
 *   reported in `bound` but flagged `allowed: true` rather than hidden;
 *   `run` defaults to a real `execFileSync` call.
 * @returns {{kind: "systemd.checkout-bound-units", host: string, root: string, observed: number, allowed: string[], bound: {unit: string, fragmentPath: string, workingDirectory: string, execStart: string, activeState: string, subState: string, allowed: boolean}[]}}
 * @throws {TypeError} when `root` is not given.
 */
export function observeSetOfCheckoutBoundUnits(host, { root, allow = [], run } = {}) {
  assertValidHost(host);
  if (!root) {
    throw new TypeError("observeSetOfCheckoutBoundUnits: missing required argument 'root'");
  }
  const resolvedRoot = path.resolve(root);
  const allowSet = new Set(allow);
  const units = serviceUnitNames(host, { run });
  const bound = [];
  for (const unit of units) {
    const text = invokeSystemctlUser(host, ["show", "-p", SHOW_PROPERTIES.join(","), unit], { run });
    const properties = parseShowOutput(text);
    const execStart = properties.ExecStart ?? "";
    const workingDirectory = properties.WorkingDirectory ?? "";
    if (!containsPathPrefix(execStart, resolvedRoot) && !containsPathPrefix(workingDirectory, resolvedRoot)) continue;
    bound.push({
      unit,
      fragmentPath: properties.FragmentPath ?? "",
      workingDirectory,
      execStart,
      activeState: properties.ActiveState ?? "",
      subState: properties.SubState ?? "",
      allowed: allowSet.has(unit),
    });
  }
  bound.sort((a, b) => (a.unit < b.unit ? -1 : a.unit > b.unit ? 1 : 0));
  const boundUnitNames = new Set(bound.map((entry) => entry.unit));
  return Object.freeze({
    kind: "systemd.checkout-bound-units",
    host,
    root: resolvedRoot,
    observed: units.length,
    allowed: allow.filter((name) => boundUnitNames.has(name)),
    bound: Object.freeze(bound.map((entry) => Object.freeze(entry))),
  });
}
