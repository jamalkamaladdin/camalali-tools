"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import type { FeedKind, SitemapReport } from "../lib/sitemap-yoxlayici";
import { normalizeTargetUrl } from "../lib/safe-url";
import { CopyButton } from "../shared/copy-button";
import {
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

/*
 * The one interaction worth explaining: a sitemap index lists its children and
 * the buttons beside them re-run the whole tool on one address. That is the
 * visible half of the route's refusal to follow them itself - the visitor
 * spends their own rate-limit slot, one file at a time, instead of one click
 * turning into five hundred requests to somebody else's server.
 */

type SitemapPayload = {
  url: string;
  status: number;
  redirectedTo: string | null;
  contentType: string | null;
  checkedAt: string;
  urlCount: number;
  childCount: number;
  withLastmod: number;
  withChangefreq: number;
  withPriority: number;
  sampleLimit: number;
  report: SitemapReport;
};

const EXAMPLES = ["camalali.com/sitemap.xml", "camalali.com/rss.xml"];

const KIND_LABELS: Record<FeedKind, string> = {
  sitemapindex: "sitemap indeksi",
  urlset: "sitemap (urlset)",
  rss: "RSS 2.0 lenti",
  atom: "Atom lenti",
  namelum: "tanınmadı",
};

const SEVERITY_LABELS = { xeta: "xəta", xeberdarliq: "xəbərdarlıq" } as const;

type State =
  | { phase: "idle" }
  | { phase: "loading"; url: string }
  | { phase: "done"; payload: SitemapPayload }
  | { phase: "error"; message: string };

export function SitemapYoxlayiciTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(raw: string) {
    /* The route validates again; this copy only saves a doomed round trip and
       the rate-limit slot that goes with it. */
    const target = normalizeTargetUrl(raw);
    if (!target.ok) {
      setState({ phase: "error", message: target.error });
      return;
    }

    setInput(target.url);
    setState({ phase: "loading", url: target.url });
    try {
      const response = await fetch(
        `/api/alet/sitemap-yoxlayici?unvan=${encodeURIComponent(target.url)}`,
      );
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: SitemapPayload; message?: string };
      if (payload.ok && payload.data) {
        setState({ phase: "done", payload: payload.data });
      } else {
        setState({ phase: "error", message: payload.message ?? "Sorğu alınmadı." });
      }
    } catch {
      setState({ phase: "error", message: "Serverlə əlaqə qurulmadı. Bir azdan yenidən yoxla." });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(input);
  }

  const busy = state.phase === "loading";

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Bu alət ünvanı serverə göndərir">
        Yazdığın faylı sənin brauzerin yox, bu saytın serveri açır və ilk 5 MB-ını oxuyur. Sitemap
        indeksi tapılsa alt fayllar avtomatik gətirilmir — ünvanları sadalanır. Daxili şəbəkə
        ünvanları (localhost, 10.x, 192.168.x) və 80/443-dən başqa portlar rədd edilir.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="Ünvan"
          action={
            <>
              {EXAMPLES.map((example) => (
                <ToolButton key={example} size="chip" disabled={busy} onClick={() => void run(example)}>
                  {example}
                </ToolButton>
              ))}
            </>
          }
        />

        <form onSubmit={onSubmit} className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <ToolField
              label="Sitemap və ya lent ünvanı"
              htmlFor="sitemap-url"
              className="min-w-56 flex-1"
              note="Sxem yazılmasa https götürülür. «.xml.gz» faylı açılmır: sıxılmamış variantı ver."
            >
              <ToolInput
                id="sitemap-url"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://example.com/sitemap.xml"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Oxunur…" : "Yoxla"}
            </ToolButton>
          </div>
        </form>
      </ToolPanel>

      {state.phase === "error" && (
        <ToolNote tone="accent" title="Alınmadı">
          {state.message}
        </ToolNote>
      )}

      {state.phase === "loading" && (
        <p className="font-ui text-sm text-muted">
          <span className="font-mono">{state.url}</span> oxunur…
        </p>
      )}

      {state.phase === "done" && <Report payload={state.payload} onCheck={(url) => void run(url)} />}
    </div>
  );
}

function Report({
  payload,
  onCheck,
}: {
  payload: SitemapPayload;
  onCheck: (url: string) => void;
}) {
  const { report } = payload;
  const errors = report.issues.filter((issue) => issue.severity === "xeta").length;
  const isIndex = report.kind === "sitemapindex";
  const count = isIndex ? payload.childCount : payload.urlCount;

  return (
    <div className="space-y-5">
      <div className="@container">
        <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
          <ToolStat
            label="Format"
            value={KIND_LABELS[report.kind]}
            note={report.rootElement === null ? "kök element yoxdur" : `kök: ${report.rootElement}`}
            tone={report.kind === "namelum" ? "warning" : "accent"}
          />
          <ToolStat
            label={isIndex ? "Alt sitemap" : "Ünvan"}
            value={report.truncated ? `${count}+` : String(count)}
            note={report.truncated ? "fayl kəsildi — natamam say" : "faylda sayılan"}
            tone={report.truncated ? "warning" : "default"}
          />
          <ToolStat
            label="Problem"
            value={errors > 0 ? `${errors} xəta` : `${report.issues.length} qeyd`}
            tone={errors > 0 ? "warning" : "default"}
          />
          <ToolStat label="Oxunuldu" value={formatAzStamp(new Date(payload.checkedAt))} />
        </div>
      </div>

      <ToolResultPanel
        title="Tapılanlar"
        hint={report.issues.length === 0 ? "təmiz" : `${report.issues.length} qeyd`}
      >
        {report.issues.length === 0 ? (
          <p className="p-4 text-sm/6">
            Fayl düzgün qurulub: format tanındı, bütün ünvanlar mütləqdir, təkrar və host qarışığı
            yoxdur.
          </p>
        ) : (
          <ul className="space-y-3 p-4">
            {report.issues.map((issue) => (
              <li key={issue.message} className="border-l-2 border-rule pl-3">
                <p className="font-ui text-[11px] text-muted">
                  {SEVERITY_LABELS[issue.severity]}
                </p>
                <p className="mt-1 text-sm/6">{issue.message}</p>
              </li>
            ))}
          </ul>
        )}
      </ToolResultPanel>

      {isIndex && <ChildList payload={payload} onCheck={onCheck} />}
      {(report.kind === "urlset" || report.kind === "rss" || report.kind === "atom") && (
        <ContentReport payload={payload} />
      )}

      <ToolAccordion>
        <ToolAccordionItem summary="Cavabın özü" hint={`HTTP ${payload.status}`}>
          <ul className="space-y-1 font-mono text-xs break-all">
            <li>ünvan: {payload.url}</li>
            <li>status: {payload.status}</li>
            <li>content-type: {payload.contentType ?? "—"}</li>
            <li>yönləndirmə: {payload.redirectedTo ?? "yoxdur"}</li>
            <li>hostlar: {report.hosts.length === 0 ? "—" : report.hosts.join(", ")}</li>
          </ul>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}

function ChildList({
  payload,
  onCheck,
}: {
  payload: SitemapPayload;
  onCheck: (url: string) => void;
}) {
  const { childSitemaps } = payload.report;
  const hidden = payload.childCount - childSitemaps.length;

  return (
    <ToolResultPanel
      title="Alt sitemap-lar"
      hint={`${payload.childCount} ədəd — avtomatik açılmır`}
      action={<CopyButton value={childSitemaps.join("\n")} label="ünvanları kopyala" />}
    >
      <div className="space-y-3 p-4">
        <p className="text-sm/6">
          Hər faylı ayrıca yoxlamaq lazımdır: bir kliklə onunu birdən gətirmək qarşı tərəfin
          serverinə hücum kimi görünür və bir dəqiqəlik sorğu haqqını dərhal yeyir.
        </p>
        <ul className="space-y-2">
          {childSitemaps.map((child) => (
            <li key={child} className="flex flex-wrap items-center gap-2">
              <ToolButton size="chip" onClick={() => onCheck(child)}>
                yoxla
              </ToolButton>
              <span className="min-w-0 flex-1 font-mono text-xs break-all">{child}</span>
            </li>
          ))}
        </ul>
        {hidden > 0 && (
          <p className="font-ui text-[11px] text-muted">
            Siyahıda ilk {payload.sampleLimit} ünvan göstərilir, qalan {hidden} ünvan faylın
            özündədir.
          </p>
        )}
      </div>
    </ToolResultPanel>
  );
}

function ContentReport({ payload }: { payload: SitemapPayload }) {
  const { report } = payload;
  const feed = report.kind === "rss" || report.kind === "atom";
  const hidden = payload.urlCount - report.urls.length;

  return (
    <>
      <div className="@container">
        <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
          <ToolStat label="Ən köhnə tarix" value={report.oldest ?? "—"} />
          <ToolStat label="Ən yeni tarix" value={report.newest ?? "—"} />
          {feed ? (
            <ToolStat label="Lentin başlığı" value={report.feedTitle ?? "—"} className="@md:col-span-2" />
          ) : (
            <>
              <ToolStat
                label="lastmod yazılıb"
                value={`${payload.withLastmod}/${payload.urlCount}`}
                note={
                  payload.withChangefreq === 0 && payload.withPriority === 0
                    ? "changefreq və priority işlənmir"
                    : `changefreq ${payload.withChangefreq}, priority ${payload.withPriority}`
                }
              />
              <ToolStat
                label="hreflang alternativi"
                value={String(report.hreflangCount)}
                note={report.hreflangCount === 0 ? "çoxdilli qeyd yoxdur" : "ünvanda alternativ var"}
              />
            </>
          )}
        </div>
      </div>

      <ToolAccordion>
        <ToolAccordionItem
          summary={feed ? "Lentdəki elementlər" : "Sitemapdakı ünvanlar"}
          hint={hidden > 0 ? `ilk ${report.urls.length} / ${payload.urlCount}` : `${payload.urlCount} ədəd`}
        >
          <div className="space-y-2">
            <CopyButton
              value={report.urls.map((url) => url.loc).join("\n")}
              label="ünvanları kopyala"
              disabled={report.urls.length === 0}
            />
            <ul className="space-y-1">
              {report.urls.map((url, index) => (
                <li key={`${url.loc}-${index}`} className="font-mono text-xs break-all">
                  <span className="text-ink">{url.loc}</span>
                  {url.lastmod !== null && <span className="text-muted"> · {url.lastmod}</span>}
                  {url.changefreq !== null && <span className="text-muted"> · {url.changefreq}</span>}
                  {url.priority !== null && <span className="text-muted"> · {url.priority}</span>}
                </li>
              ))}
            </ul>
            {hidden > 0 && (
              <p className="font-ui text-[11px] text-muted">
                Burada ilk {payload.sampleLimit} sətir göstərilir; yuxarıdakı saylar isə faylın
                bütövü üzrədir.
              </p>
            )}
          </div>
        </ToolAccordionItem>
      </ToolAccordion>
    </>
  );
}
