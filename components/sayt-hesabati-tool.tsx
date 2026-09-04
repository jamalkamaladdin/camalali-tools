"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { formatAzStamp } from "../shared/az-date";
import { normalizeTargetUrl } from "../lib/safe-url";
import {
  SECTION_LABELS,
  SECTION_ORDER,
  STATUS_LABELS,
  type CheckStatus,
  type ReportSection,
  type SiteCheck,
  type SiteReportPayload,
} from "../lib/site-report";
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
 * The report is not stored anywhere, and the link is what replaces storage.
 *
 * There is no database in this project, so a shareable report has two possible
 * homes: a saved row somewhere, or the address bar. The address bar wins on
 * both counts that matter here — a link built from the checked address can
 * never go stale, because opening it runs the checks again against the site as
 * it is today, and a saved report would show last week's site under today's
 * date. So `?unvan=` carries the whole state.
 *
 * The `useSearchParams` and `replaceState` pair is a known trap in this
 * project and the estimator's comment records why: the app router intercepts
 * `replaceState`, so writing the URL re-runs the hook, and a component that
 * writes on every render loops until the page times out. The rules that stop
 * it are the estimator's, followed here rather than reinvented — write only
 * after the visitor has actually run something, write only on the `/alet`
 * route, and key the effect on the string.
 */

const EXAMPLES = ["camalali.com", "vercel.com"];

const STATUS_ORDER: CheckStatus[] = ["kecmedi", "xeberdarliq", "kecdi"];

type State =
  | { phase: "idle" }
  | { phase: "loading"; url: string }
  | { phase: "done"; payload: SiteReportPayload }
  | { phase: "error"; message: string };

export function SaytHesabatiTool() {
  const params = useSearchParams();
  const linkTarget = params.get("unvan") ?? "";

  const [input, setInput] = useState(linkTarget);
  const [state, setState] = useState<State>({ phase: "idle" });
  /* What the address bar should say. Empty until the first run, which is what
     keeps an untouched form from rewriting the URL it was opened with. */
  const [shared, setShared] = useState("");

  async function run(raw: string) {
    /* The route validates again; this copy only saves a doomed round trip and
       the rate-limit slot that goes with it — and here a slot is five
       connections, not one. */
    const target = normalizeTargetUrl(raw);
    if (!target.ok) {
      setState({ phase: "error", message: target.error });
      return;
    }

    setInput(target.url);
    setShared(target.url);
    setState({ phase: "loading", url: target.url });

    try {
      const response = await fetch(
        `/api/alet/sayt-hesabati?unvan=${encodeURIComponent(target.url)}`,
      );
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: SiteReportPayload; message?: string };
      if (payload.ok && payload.data) {
        setState({ phase: "done", payload: payload.data });
      } else {
        setState({ phase: "error", message: payload.message ?? "Sorğu alınmadı." });
      }
    } catch {
      setState({ phase: "error", message: "Serverlə əlaqə qurulmadı. Bir azdan yenidən yoxla." });
    }
  }

  /* A link opened with `?unvan=` runs itself once. The ref is the whole guard:
     without it the effect would re-run the report every time the URL is
     rewritten below, which is the loop this file's header warns about. */
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current || linkTarget.trim() === "") return;
    opened.current = true;
    void run(linkTarget);
  }, [linkTarget]);

  useEffect(() => {
    if (shared === "") return;
    /* Only where the tool is the page. Inside a desktop window the address bar
       belongs to the desktop and carries which windows are open. */
    if (!window.location.pathname.startsWith("/alet")) return;
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}?unvan=${encodeURIComponent(shared)}`,
    );
  }, [shared]);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void run(input);
  }

  const busy = state.phase === "loading";

  return (
    <div className="mt-8 space-y-5">
      <ToolNote tone="accent" title="Bu alət ünvanı serverə göndərir">
        Yazdığın saytı sənin brauzerin yox, bu saytın serveri açır: səhifənin özü, onun http
        variantı, /robots.txt və sitemap faylı — dörd sorğu, üstəgəl sertifikat üçün bir TLS
        əlaqəsi. Ona görə burada dəqiqədə cəmi beş hesabat qurmaq olar. Daxili şəbəkə ünvanları
        (localhost, 10.x, 192.168.x) və 80/443-dən başqa portlar rədd edilir.
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
              label="Sayt ünvanı"
              htmlFor="hesabat-url"
              className="min-w-56 flex-1"
              note="Sxem yazılmasa https götürülür. Yönləndirmə izlənmir: son ünvanı yaz."
            >
              <ToolInput
                id="hesabat-url"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Yoxlanır…" : "Hesabat qur"}
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
          <span className="font-mono">{state.url}</span> yoxlanır — beş əlaqə qurulur, bu bir neçə
          saniyə çəkir…
        </p>
      )}

      {state.phase === "done" && <Report payload={state.payload} />}
    </div>
  );
}

/** The one-line verdict and the four counters above the rows. */
function Summary({ payload }: { payload: SiteReportPayload }) {
  const { report } = payload;

  return (
    <div className="@container">
      <div className="grid gap-3 @md:grid-cols-2 @3xl:grid-cols-4">
        <ToolStat
          label="Nəticə"
          value={`${report.score}%`}
          note={report.headline}
          tone={report.failed > 0 ? "warning" : "accent"}
        />
        <ToolStat label="Keçdi" value={String(report.passed)} note={`${report.checks.length} yoxlamadan`} />
        <ToolStat
          label="Xəbərdarlıq"
          value={String(report.warnings)}
          tone={report.warnings > 0 ? "warning" : "default"}
        />
        <ToolStat
          label="Keçmədi"
          value={String(report.failed)}
          tone={report.failed > 0 ? "warning" : "default"}
        />
      </div>
    </div>
  );
}

function Report({ payload }: { payload: SiteReportPayload }) {
  const { report } = payload;

  /* The plain-text copy is the report's portable form: somebody who wants to
     hand it to a developer should not have to screenshot four panels. */
  const asText = [
    `${report.url} — ${formatAzStamp(new Date(report.checkedAt))}`,
    report.headline,
    "",
    ...SECTION_ORDER.flatMap((section) => [
      `## ${SECTION_LABELS[section]}`,
      ...report.checks
        .filter((check) => check.section === section)
        .map(
          (check) =>
            `- [${STATUS_LABELS[check.status]}] ${check.label}${check.value === null ? "" : `: ${check.value}`} — ${check.detail}${check.fix === null ? "" : ` Düzəliş: ${check.fix}`}`,
        ),
      "",
    ]),
  ].join("\n");

  return (
    <div className="space-y-5">
      <Summary payload={payload} />

      {report.htmlTruncated && (
        <ToolNote title="Səhifə kəsildi">
          HTML yarım meqabaytdan böyük olduğu üçün oxumaq dayandırıldı. Başlıq, H1 və alt mətn
          sətirləri yalnız oxunan hissəyə aiddir.
        </ToolNote>
      )}

      {SECTION_ORDER.map((section) => (
        <SectionPanel key={section} section={section} checks={report.checks} />
      ))}

      <ToolAccordion>
        <ToolAccordionItem summary="Hesabat mətn kimi" hint="kopyalanır">
          <div className="space-y-2">
            <CopyButton value={asText} label="hesabatı kopyala" />
            <pre className="overflow-x-auto font-mono text-xs whitespace-pre-wrap">{asText}</pre>
          </div>
        </ToolAccordionItem>
        <ToolAccordionItem summary="Nə oxundu" hint={`HTTP ${payload.status}`}>
          <ul className="space-y-1 font-mono text-xs break-all">
            <li>səhifə: {report.url}</li>
            <li>http variantı: {payload.httpUrl ?? "yoxlanmadı"}</li>
            <li>robots: {payload.robotsUrl ?? "—"}</li>
            <li>sitemap: {payload.sitemapUrl ?? "—"}</li>
            <li>yönləndirmə: {payload.redirectedTo ?? "yoxdur"}</li>
            <li>oxunma vaxtı: {formatAzStamp(new Date(report.checkedAt))}</li>
          </ul>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}

function SectionPanel({ section, checks }: { section: ReportSection; checks: SiteCheck[] }) {
  const rows = checks.filter((check) => check.section === section);
  const failed = rows.filter((check) => check.status === "kecmedi").length;
  const warnings = rows.filter((check) => check.status === "xeberdarliq").length;

  /* Failures first inside a section, because a visitor reading top to bottom
     should meet the thing that costs them the most on the first line. */
  const ordered = [...rows].sort(
    (left, right) => STATUS_ORDER.indexOf(left.status) - STATUS_ORDER.indexOf(right.status),
  );

  const hint =
    failed === 0 && warnings === 0
      ? "hamısı keçdi"
      : [failed > 0 ? `${failed} keçmədi` : null, warnings > 0 ? `${warnings} xəbərdarlıq` : null]
          .filter(Boolean)
          .join(" · ");

  return (
    <ToolResultPanel title={SECTION_LABELS[section]} hint={hint}>
      <ul className="divide-y divide-rule">
        {ordered.map((check) => (
          <CheckRow key={check.id} check={check} />
        ))}
      </ul>
    </ToolResultPanel>
  );
}

function CheckRow({ check }: { check: SiteCheck }) {
  return (
    <li className="p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        {/* The verdict is a word, not a colour: the palette has one accent and
            no red, so a row told apart by hue alone would be told apart by
            nothing in greyscale. */}
        <span className="font-ui text-[11px] text-muted">{STATUS_LABELS[check.status]}</span>
        <span className="font-ui text-sm font-semibold">{check.label}</span>
        {check.value !== null && (
          <span className="min-w-0 font-mono text-xs break-all text-muted">{check.value}</span>
        )}
      </div>
      <p className="mt-2 text-sm/6">{check.detail}</p>
      {check.fix !== null && (
        <p className="mt-2 border-l-2 border-rule pl-3 text-sm/6 text-muted">
          Düzəliş: {check.fix}
        </p>
      )}
    </li>
  );
}
