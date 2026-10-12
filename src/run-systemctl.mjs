import { execFileSync } from "node:child_process";

/**
 * The real `run` implementation: a synchronous child-process call, stdout captured as text.
 * This is the package's one irreducible effect (data/records/house-architecture-norms.json,
 * "hull-never-imports-kernel" names filesystem/process effects as irreducible kernel) -- every
 * other export in this package is a required, no-default `run` parameter away from being pure,
 * and takes it. A caller at the kernel edge (this package's own scripts/, or another package's)
 * supplies `runSystemctl` explicitly; a test supplies a fake instead and never touches a real
 * shell.
 * @param {string} command
 * @param {string[]} args
 * @returns {string} raw stdout text.
 */
export function runSystemctl(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}
