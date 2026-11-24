// A host is either the literal "local" (systemctl --user on the calling
// machine) or a bare SSH destination string this process passes straight to
// `ssh`. It is never a credential: SSH auth is whatever the caller's own
// environment already trusts, and this die refuses to read or carry a key.
const HOST_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/u;

export function assertValidHost(host) {
  if (host !== "local" && !HOST_PATTERN.test(host)) {
    throw new Error(`--host must be 'local' or a bare SSH destination, got '${host}'`);
  }
  return host;
}

/**
 * Invokes `systemctl --user <args...>` against one host through the
 * local/ssh transport this package owns, returning raw stdout text. This is
 * the one place either transport is constructed; every other export in this
 * package (and its resource-accounting sibling) routes through it so a test
 * can inject a fake `run` and never touches a real shell.
 * @param {string} host - "local" or a bare SSH destination.
 * @param {string[]} args - systemctl arguments placed after `--user`. Callers
 *   must never pass a mutating verb; this function itself enforces nothing
 *   beyond host validation.
 * @param {{run: (command: string, args: string[]) => string}} options -
 *   `run` is required, no default: run-systemctl.mjs's runSystemctl is the real
 *   implementation, supplied by the caller at the kernel edge (this file used to
 *   default to it directly, which made this a hull-importing-kernel violation --
 *   data/records/house-architecture-norms.json -- despite every real caller
 *   already passing its own `run`).
 * @returns {string} raw stdout text.
 */
export function invokeSystemctlUser(host, args, { run }) {
  assertValidHost(host);
  return host === "local"
    ? run("systemctl", ["--user", ...args])
    : run("ssh", [host, "systemctl", "--user", ...args]);
}

// Exactly two systemctl subcommands, both read-only by systemd's own contract.
// No other systemctl verb is ever constructed here, so this cannot mutate a
// unit regardless of caller input.
function systemctlArgs(verb) {
  return [verb, "--all", "--output=json"];
}

/**
 * Read-only systemd unit and timer inventory for one host.
 * @param {string} host - "local" or a bare SSH destination.
 * @param {{run: (command: string, args: string[]) => string}} options -
 *   `run` is required, no default; tests inject a fake.
 * @returns {{host: string, units: object[], timers: object[]}}
 */
export function observeUnitInventory(host, { run }) {
  assertValidHost(host);
  return {
    host,
    units: JSON.parse(invokeSystemctlUser(host, systemctlArgs("list-units"), { run })),
    timers: JSON.parse(invokeSystemctlUser(host, systemctlArgs("list-timers"), { run })),
  };
}

/**
 * The service-unit names on one host: the union of `list-units --all`
 * (units the manager has loaded) and `list-unit-files --all` (every
 * installed unit file, including a static, timer-triggered unit the
 * manager has never loaded this boot) -- the default unit set for
 * accounting and checkout-bound observation when a caller supplies none.
 * Was observe-unit-resource-accounting.mjs's (it does not itself read the
 * clock the way that module's own two exports do, so nothing here needed
 * that module's clock-reading effect -- moved so a caller of this,
 * observeUnitInventory's own sibling, never has to cross into a module that
 * is kernel only because of code this function never runs).
 * @param {string} host
 * @param {{run: (command: string, args: string[]) => string}} options
 * @returns {string[]} deduplicated, sorted service-unit names.
 */
export function serviceUnitNames(host, { run }) {
  const fromUnits = observeUnitInventory(host, { run }).units
    .map((entry) => entry.unit)
    .filter((name) => name.endsWith(".service"));
  const unitFiles = JSON.parse(invokeSystemctlUser(host, ["list-unit-files", "--all", "--output=json"], { run }));
  const fromUnitFiles = unitFiles
    .map((entry) => entry.unit_file)
    .filter((name) => name.endsWith(".service"));
  return Array.from(new Set([...fromUnits, ...fromUnitFiles])).sort();
}
