import { execFileSync } from "node:child_process";

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

function run(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

// Exactly two systemctl subcommands, both read-only by systemd's own contract.
// No other systemctl verb is ever constructed here, so this cannot mutate a
// unit regardless of caller input.
function systemctlArgs(verb) {
  return ["--user", verb, "--all", "--output=json"];
}

function observeLocal(verb) {
  return JSON.parse(run("systemctl", systemctlArgs(verb)));
}

function observeRemote(host, verb) {
  return JSON.parse(run("ssh", [host, "systemctl", ...systemctlArgs(verb)]));
}

export function observeUnitInventory(host) {
  assertValidHost(host);
  const observe = host === "local" ? (verb) => observeLocal(verb) : (verb) => observeRemote(host, verb);
  return {
    host,
    units: observe("list-units"),
    timers: observe("list-timers"),
  };
}
