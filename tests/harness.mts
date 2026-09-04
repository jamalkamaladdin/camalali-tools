/*
 * The shape a tool's check file has to take.
 *
 * `verify-tools.mts` grew to two thousand lines while every tool's cases lived
 * in it, and that is a file two people cannot edit at once. A tool added after
 * that split brings its own file here and exports one suite; the runner
 * imports it and hands it the same counter every other case uses, so a failure
 * reads identically no matter which file raised it.
 */

/** Records one case. `because` is printed only when the case fails. */
export type Check = (name: string, condition: boolean, because: string) => void;

/** What every file in this folder exports, under the name `checks`. */
export type CheckSuite = (check: Check) => void;
