import { Resolver } from "node:dns/promises";

import { fail, guard, ok } from "../../lib/api-route";
import { cached } from "../../lib/api-cache";
import { checkHostname } from "../../lib/socket-probe";
import {
  buildDkimSelectorList,
  buildMailFindings,
  buildMxReport,
  describeDkimTxt,
  dkimSelectorHost,
  isDmarcRecord,
  isSpfRecord,
  joinTxtChunks,
  parseDmarc,
  type DkimSelectorResult,
  type MailReport,
  type MxRecord,
} from "../../lib/mail-qeydleri";

/*
 * The mail DNS overview endpoint.
 *
 * Every question this tool answers is a DNS question, so the fence around it
 * is simpler than most of this folder's: `checkHostname` validates the typed
 * name and confirms it actually resolves before a single mail-specific query
 * is sent, which is also what makes the "domain is not registered at all"
 * case in `dns/route.ts` unnecessary here — a name that failed to resolve
 * never reaches `lookupMail`.
 *
 * About twenty queries run for one visitor click: MX, the apex TXT set,
 * `_dmarc`, up to sixteen DKIM selectors, `_mta-sts`, the `mta-sts` policy
 * host, `_smtp._tls`, `default._bimi` and `_domainkey`. They run through one
 * `Promise.allSettled` rather than in sequence, and a single rejected one is
 * read as "this record is absent" rather than failing the page — a zone
 * that is merely slow to answer `default._bimi` should not stop the visitor
 * from seeing their MX and SPF.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A mail policy changes on a deploy or a provider switch, not between two clicks. */
const CACHE_TTL_MS = 300_000;

const QUERY_TIMEOUT_MS = 4_000;
const QUERY_TRIES = 2;

/** Any rejection reads as "this record is absent" — see the file comment. */
async function txtAt(resolver: Resolver, name: string): Promise<string[]> {
  try {
    return (await resolver.resolveTxt(name)).map(joinTxtChunks);
  } catch {
    return [];
  }
}

async function hostResolves(resolver: Resolver, name: string): Promise<boolean> {
  try {
    await resolver.resolve(name);
    return true;
  } catch {
    return false;
  }
}

function miscOf(records: string[]): { present: boolean; value: string | null } {
  return { present: records.length > 0, value: records[0] ?? null };
}

async function lookupMail(domain: string, selectors: string[]): Promise<MailReport> {
  const resolver = new Resolver({ timeout: QUERY_TIMEOUT_MS, tries: QUERY_TRIES });

  const [
    mxAnswer,
    apexTxt,
    dmarcTxt,
    mtaStsTxt,
    mtaStsHost,
    tlsRptTxt,
    bimiTxt,
    domainkeyTxt,
    dkimAnswers,
  ] = await Promise.all([
    resolver.resolveMx(domain).catch(() => []),
    txtAt(resolver, domain),
    txtAt(resolver, `_dmarc.${domain}`),
    txtAt(resolver, `_mta-sts.${domain}`),
    hostResolves(resolver, `mta-sts.${domain}`),
    txtAt(resolver, `_smtp._tls.${domain}`),
    txtAt(resolver, `default._bimi.${domain}`),
    txtAt(resolver, `_domainkey.${domain}`),
    Promise.all(
      selectors.map(async (selector) => ({
        selector,
        records: await txtAt(resolver, dkimSelectorHost(domain, selector)),
      })),
    ),
  ]);

  const mx: MxRecord[] = mxAnswer.map((entry) => ({ priority: entry.priority, host: entry.exchange }));
  const mxReport = buildMxReport(mx);

  const spfRecords = apexTxt.filter(isSpfRecord);
  const dmarcValue = dmarcTxt.find(isDmarcRecord) ?? null;
  const dmarc = dmarcValue !== null ? parseDmarc(dmarcValue) : null;

  const dkim: DkimSelectorResult[] = dkimAnswers.map(({ selector, records }) => {
    const value = records[0] ?? null;
    if (value === null) return { selector, found: false, value: null, keyType: null, revoked: false };
    const { keyType, revoked } = describeDkimTxt(value);
    return { selector, found: true, value, keyType, revoked };
  });

  const findings = buildMailFindings({
    mx: mxReport.records,
    nullMx: mxReport.nullMx,
    spfRecords,
    dmarc,
  });

  return {
    domain,
    checkedAt: new Date().toISOString(),
    mx: mxReport,
    spf: { records: spfRecords },
    dmarc,
    dkim,
    misc: {
      mtaSts: miscOf(mtaStsTxt),
      mtaStsPolicyHost: mtaStsHost,
      tlsRpt: miscOf(tlsRptTxt),
      bimi: miscOf(bimiTxt),
      domainkey: miscOf(domainkeyTxt),
    },
    findings,
  };
}

export async function GET(request: Request) {
  const refused = guard(request, "mail-qeydleri");
  if (refused) return refused;

  const url = new URL(request.url);
  const raw = url.searchParams.get("domen") ?? "";
  const customSelector = url.searchParams.get("selector") ?? undefined;

  const validated = checkHostname(raw);
  if (!validated.ok) return fail(validated.message, validated.status);

  const domain = validated.hostname;
  const selectors = buildDkimSelectorList(customSelector);

  try {
    const report = await cached(`mail-qeydleri:${domain}:${selectors.join(",")}`, CACHE_TTL_MS, () =>
      lookupMail(domain, selectors),
    );
    return ok(report);
  } catch {
    return fail("Ad serveri ilə əlaqə qurulmadı. Bir azdan yenidən yoxla.", 502);
  }
}
