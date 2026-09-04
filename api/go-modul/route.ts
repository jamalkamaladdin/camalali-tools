/*
 * Proxies one Go module lookup against `proxy.golang.org`.
 *
 * Three upstream calls, same shape as the npm route beside this one: `@v/list`
 * for the full tag list (plain text), `@v/<version>.info` for the exact
 * publish time of whichever version this file's own sort decided is newest,
 * and `@latest` only as a fallback for a module that has never been tagged —
 * a pseudo-version-only module answers an empty `@v/list` but still resolves
 * through `@latest`.
 *
 * Every path segment sent upstream goes through `escapeModulePath` first:
 * the proxy protocol requires it, and a request built from the raw,
 * mixed-case path 404s against a real module every time.
 */
import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import {
  buildGoGetCommand,
  escapeModulePath,
  extractMajorSuffix,
  parseGoModulePath,
  parseVersionInfoJson,
  parseVersionList,
  sortVersionsDescending,
  type GoModuleReport,
} from "../../lib/go-modul";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A module's tag list and latest version do not change minute to minute. */
const CACHE_TTL_MS = 10 * 60_000;

const RECENT_VERSIONS_SHOWN = 10;

type LoadOutcome = { ok: true; data: GoModuleReport } | { ok: false; message: string };

async function fetchJson(url: string, service: string): Promise<{ ok: true; json: unknown } | { ok: false; message: string }> {
  const result = await upstream(url);
  if (!result.ok) return { ok: false, message: upstreamMessage(service, result) };
  try {
    return { ok: true, json: JSON.parse(result.text) };
  } catch {
    return { ok: false, message: `${service} gözlənilməz formatda cavab verdi.` };
  }
}

async function loadModule(modulePath: string): Promise<LoadOutcome> {
  const escapedPath = escapeModulePath(modulePath);
  const service = "Go modul proxy-si";

  const listResult = await upstream(`https://proxy.golang.org/${escapedPath}/@v/list`);
  const versions = listResult.ok ? sortVersionsDescending(parseVersionList(listResult.text)) : [];

  let latestVersion: string;
  let latestReleasedAt: string;

  if (versions.length > 0) {
    // The highest version by this file's own semver sort, not whichever
    // version the proxy's `@latest` happens to pick — the two normally
    // agree, and asking for this one's own `.info` keeps the displayed date
    // tied to the version actually shown as "the latest" above it.
    const top = versions[0];
    const info = await fetchJson(`https://proxy.golang.org/${escapedPath}/@v/${escapeModulePath(top)}.info`, service);
    if (!info.ok) return { ok: false, message: info.message };
    const parsed = parseVersionInfoJson(info.json);
    if (!parsed) return { ok: false, message: `${service} gözlənilməz formatda cavab verdi.` };
    latestVersion = parsed.version;
    latestReleasedAt = parsed.time;
  } else {
    // No tags at all — a module that has only ever been fetched at a
    // pseudo-version. `@latest` is the proxy's own answer for that case.
    const latest = await fetchJson(`https://proxy.golang.org/${escapedPath}/@latest`, service);
    if (!latest.ok) return { ok: false, message: latest.message };
    const parsed = parseVersionInfoJson(latest.json);
    if (!parsed) return { ok: false, message: `${service} bu modulu tapmadı.` };
    latestVersion = parsed.version;
    latestReleasedAt = parsed.time;
  }

  return {
    ok: true,
    data: {
      modulePath,
      majorSuffix: extractMajorSuffix(modulePath),
      latestVersion,
      latestReleasedAt,
      recentVersions: versions.slice(0, RECENT_VERSIONS_SHOWN),
      goGetCommand: buildGoGetCommand(modulePath, latestVersion),
    },
  };
}

export async function GET(request: Request) {
  const refused = guard(request, "go-modul");
  if (refused) return refused;

  const url = new URL(request.url);
  const parsed = parseGoModulePath(url.searchParams.get("modul") ?? "");
  if (!parsed.ok) return fail(parsed.error);

  try {
    const outcome = await cached(`go-modul:${parsed.path}`, CACHE_TTL_MS, () => loadModule(parsed.path));
    if (!outcome.ok) return fail(outcome.message);
    return ok(outcome.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Naməlum xəta.";
    return fail(message, 502);
  }
}
