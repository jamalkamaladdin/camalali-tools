/*
 * Proxies one Packagist package lookup. Two upstream calls: the Composer v2
 * metadata endpoint (`repo.packagist.org/p2`) for the version list, and the
 * older stats endpoint (`packagist.org/packages`) for download counts and the
 * abandoned flag — see `lib/tools/packagist.ts` for how the two are combined.
 * The stats call is best-effort: an outage there must not hide version data
 * that already arrived, only leave the abandoned flag and downloads unknown.
 */
import { fail, guard, ok, upstream, upstreamMessage } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { buildPackagistPackageInfo, parsePackagistName } from "../../lib/packagist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PACKAGIST_CACHE_TTL_MS = 10 * 60_000;

type LoadOutcome = { ok: true; data: unknown } | { ok: false; message: string };

async function loadPackage(fullName: string): Promise<LoadOutcome> {
  const segment = fullName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");

  const metadata = await upstream(`https://repo.packagist.org/p2/${segment}.json`);
  if (!metadata.ok) return { ok: false, message: upstreamMessage("Packagist", metadata) };

  let p2Json: unknown;
  try {
    p2Json = JSON.parse(metadata.text);
  } catch (error) {
    console.error(`packagist: could not parse p2 body for ${fullName}`, error);
    throw new Error("Packagist gözlənilməz formatda cavab verdi.");
  }

  // Best-effort only: a stats failure must not fail a lookup whose version
  // data already arrived successfully above.
  let statsJson: unknown = null;
  const stats = await upstream(`https://packagist.org/packages/${segment}.json`);
  if (stats.ok) {
    try {
      statsJson = JSON.parse(stats.text);
    } catch (error) {
      console.warn(`packagist: could not parse stats body for ${fullName}`, error);
    }
  }

  const info = buildPackagistPackageInfo(p2Json, statsJson, fullName);
  if (!info) return { ok: false, message: "Packagist belə bir paket tapmadı." };
  return { ok: true, data: info };
}

export async function GET(request: Request) {
  const refused = guard(request, "packagist");
  if (refused) return refused;

  const url = new URL(request.url);
  const parsed = parsePackagistName(url.searchParams.get("paket") ?? "");
  if (!parsed.ok) return fail(parsed.error);

  try {
    const outcome = await cached(`packagist:${parsed.fullName}`, PACKAGIST_CACHE_TTL_MS, () =>
      loadPackage(parsed.fullName),
    );
    if (!outcome.ok) return fail(outcome.message);
    return ok(outcome.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Naməlum xəta.";
    return fail(message, 502);
  }
}
