"use client";

import { useMemo, useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { CopyButton } from "../shared/copy-button";
import { normalizeTargetUrl } from "../lib/safe-url";
import {
  KNOWN_BOTS,
  testPaths,
  type RobotsIssue,
  type RobotsLiveReport,
} from "../lib/robots-canli";
import {
  accentWash,
  ToolAccordion,
  ToolAccordionItem,
  ToolButton,
  ToolField,
  ToolInput,
  ToolLabel,
  ToolNote,
  ToolOutput,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolSelect,
  ToolStat,
  ToolTextArea,
} from "./ui";

const EXAMPLES = ["camalali.com", "github.com", "wikipedia.org"];

/* Something to look at before the visitor has thought of anything: the root,
   a page that is usually open, and the two folders most files close. */
const DEFAULT_PATHS = "/\n/bloq/xeber\n/admin\n/api/rey";

const SEVERITY_WORDS = {
  xeta: "xəta",
  xeberdarliq: "xəbərdarlıq",
  melumat: "məlumat",
} as const;

type State =
  | { phase: "idle" }
  | { phase: "loading"; host: string }
  | { phase: "done"; report: RobotsLiveReport }
  | { phase: "error"; message: string };

export function RobotsCanliTool() {
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

    setState({ phase: "loading", host: target.hostname });
    try {
      const response = await fetch(`/api/alet/robots-canli?domen=${encodeURIComponent(target.url)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: RobotsLiveReport; message?: string };
      if (payload.ok && payload.data) {
        setState({ phase: "done", report: payload.data });
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
      <ToolNote tone="accent" title="Bu alət sorğunu serverə göndərir">
        Yazdığın domenin <span className="font-mono text-xs">/robots.txt</span> ünvanını sənin
        brauzerin yox, bu saytın serveri açır — başqa heç bir səhifəyə toxunulmur. Aşağıdakı sınaq
        sahəsinə yazdığın yollar isə serverə ümumiyyətlə göndərilmir: onlar brauzerdə, artıq
        gətirilmiş faylın mətni üzərində yoxlanılır.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="Domen"
          action={
            <>
              {EXAMPLES.map((example) => (
                <ToolButton
                  key={example}
                  size="chip"
                  disabled={busy}
                  onClick={() => {
                    setInput(example);
                    void run(example);
                  }}
                >
                  {example}
                </ToolButton>
              ))}
            </>
          }
        />

        <form onSubmit={onSubmit} className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <ToolField
              label="Domen adı"
              htmlFor="robots-canli-domen"
              className="min-w-56 flex-1"
              note="Yalnız domen götürülür: yazdığın yol nəzərə alınmır, fayl həmişə /robots.txt ünvanından gətirilir."
            >
              <ToolInput
                id="robots-canli-domen"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Gətirilir…" : "Gətir"}
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
        <p className="text-sm text-muted">
          <span className="font-mono">
            {state.host}/robots.txt
          </span>{" "}
          gətirilir…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: RobotsLiveReport }) {
  const missing = report.status === 404 || report.status === 410;

  return (
    <div className="space-y-5">
      <div className="@container">
        <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          <ToolStat
            label="HTTP cavabı"
            value={String(report.status)}
            tone={missing ? "warning" : "accent"}
            note={missing ? "fayl yoxdur" : undefined}
          />
          <ToolStat label="Ölçü" value={`${(report.byteLength / 1024).toFixed(1)} KB`} />
          <ToolStat label="Qrup" value={String(report.doc.groups.length)} />
          <ToolStat label="Sitemap" value={String(report.doc.sitemaps.length)} />
        </div>
      </div>

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">{report.url}</span> · {formatAzStamp(new Date(report.checkedAt))}
      </p>

      {missing && (
        <ToolNote tone="accent" title="robots.txt yoxdur">
          Bu domendə fayl tapılmadı. Bu, xəta deyil — faylı olmayan sayt botlara tam açıq sayılır və
          hər səhifəsi oxuna bilər. Nəyisə bağlamaq lazımdırsa əvvəlcə fayl yaradılmalıdır.
        </ToolNote>
      )}

      <ToolResultPanel
        title="Problemlər"
        hint={report.issues.length === 0 ? "tapılmadı" : `${report.issues.length} bənd`}
      >
        <div className="space-y-3 p-3">
          {report.issues.length === 0 ? (
            <p className="text-sm/6 text-muted">Faylda diqqət çəkən bir şey tapılmadı.</p>
          ) : (
            report.issues.map((issue, index) => <IssueRow key={index} issue={issue} />)
          )}
        </div>
      </ToolResultPanel>

      {report.doc.groups.length > 0 && <GroupTable report={report} />}

      <PathTester report={report} />

      <ToolAccordion>
        {report.doc.sitemaps.length > 0 && (
          <ToolAccordionItem
            summary="Sitemap sətirləri"
            hint={`${report.doc.sitemaps.length} ədəd`}
            group="robots-canli"
          >
            <ul className="space-y-1">
              {report.doc.sitemaps.map((sitemap) => (
                <li key={`${sitemap.line}-${sitemap.url}`} className="text-xs break-all">
                  <span className="text-muted">{sitemap.line}. sətir</span> —{" "}
                  <span className="font-mono">{sitemap.url}</span>
                </li>
              ))}
            </ul>
          </ToolAccordionItem>
        )}

        <ToolAccordionItem
          summary="Faylın öz mətni"
          hint={report.truncated ? "kəsilib" : `${report.byteLength} bayt`}
          group="robots-canli"
        >
          <div className="space-y-2">
            <CopyButton value={report.text} label="mətni kopyala" disabled={report.text === ""} />
            {report.truncated && (
              <p className="font-ui text-[11px] text-muted">
                Fayl büdcədən uzun idi və oxunuşu kəsildi — aşağıdakı mətn tam deyil.
              </p>
            )}
            <ToolOutput className="max-h-96 overflow-y-auto">
              {report.text === "" ? "(boş)" : report.text}
            </ToolOutput>
          </div>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}

function IssueRow({ issue }: { issue: RobotsIssue }) {
  return (
    <div
      className={`border-l-2 pl-3 ${issue.severity === "melumat" ? "border-l-rule" : "border-l-accent"}`}
    >
      <p className="font-ui text-[11px] text-muted">
        {SEVERITY_WORDS[issue.severity]}
        {issue.line !== null && ` · ${issue.line}. sətir`}
      </p>
      <p className="mt-1 text-sm/6">{issue.message}</p>
    </div>
  );
}

function GroupTable({ report }: { report: RobotsLiveReport }) {
  return (
    <ToolResultPanel title="Qruplar" hint={`${report.doc.groups.length} qrup`}>
      <div className="space-y-3 p-3">
        {report.doc.groups.map((group, index) => (
          <div key={index} className="rounded border border-result-rule p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h3 className="font-mono text-xs font-semibold break-all">
                User-agent: {group.agents.join(", ")}
              </h3>
              {group.crawlDelay !== null && (
                <span className="text-[11px] text-muted">
                  <span className="font-mono">Crawl-delay: {group.crawlDelay}</span> san
                </span>
              )}
            </div>

            {group.rules.length === 0 ? (
              <p className="mt-2 text-sm/6 text-muted">
                Bu qrupda qayda yoxdur — həmin botlar üçün heç nə bağlanmır.
              </p>
            ) : (
              <ul className="mt-2 space-y-1">
                {group.rules.map((rule) => (
                  <li key={rule.line} className="font-mono text-xs break-all">
                    <span className="text-muted">{rule.line}.</span>{" "}
                    <span className="font-semibold">
                      {rule.kind === "allow" ? "Allow" : "Disallow"}:
                    </span>{" "}
                    {rule.path === "" ? (
                      <span className="text-muted">(boş — heç nəyə təsir etmir)</span>
                    ) : (
                      rule.path
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </ToolResultPanel>
  );
}

/**
 * The part that answers "why is this blocked".
 *
 * Everything below runs in the browser against the already fetched text, so a
 * visitor can try twenty paths without twenty requests going anywhere - and the
 * paths they try, which can name pages nobody has published yet, never leave
 * the page.
 */
function PathTester({ report }: { report: RobotsLiveReport }) {
  const [agent, setAgent] = useState("*");
  const [paths, setPaths] = useState(DEFAULT_PATHS);

  const lines = useMemo(
    () =>
      paths
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== ""),
    [paths],
  );

  const verdicts = useMemo(
    () => testPaths(report.doc, agent, lines),
    [report.doc, agent, lines],
  );

  const blocked = verdicts.filter((verdict) => !verdict.allowed).length;

  return (
    <ToolPanel>
      <ToolPanelHeader title="Yolları sına" hint={`${lines.length} yol`} />

      <div className="@container">
        <div className="grid gap-4 p-4 @min-[34rem]:grid-cols-2">
          <ToolField
            label="Bot"
            htmlFor="robots-canli-bot"
            note="Adı çəkilən bot yalnız öz qrupunu oxuyur, * qrupu ona əlavə olunmur."
          >
            <ToolSelect
              id="robots-canli-bot"
              value={agent}
              onChange={(event) => setAgent(event.target.value)}
            >
              {KNOWN_BOTS.map((bot) => (
                <option key={bot.id} value={bot.id}>
                  {bot.label}
                </option>
              ))}
            </ToolSelect>
          </ToolField>

          <ToolField
            label="Yollar"
            htmlFor="robots-canli-yollar"
            hint="hər sətirdə bir"
            note="Tam ünvan yapışdırsan, yalnız yol hissəsi götürülür."
          >
            <ToolTextArea
              id="robots-canli-yollar"
              value={paths}
              onChange={(event) => setPaths(event.target.value)}
              rows={5}
              spellCheck={false}
            />
          </ToolField>
        </div>
      </div>

      {verdicts.length > 0 && (
        <div className="border-t border-rule p-3">
          <ToolLabel className="mb-2">
            Nəticə — {blocked} bloklanıb, {verdicts.length - blocked} açıqdır
          </ToolLabel>
          <ul className="space-y-2">
            {verdicts.map((verdict, index) => (
              <li
                key={`${verdict.path}-${index}`}
                className={`border-l-2 pl-3 ${verdict.allowed ? "border-l-rule" : "border-l-accent"}`}
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-mono text-sm break-all">{verdict.path}</span>
                  <span
                    className={`text-[11px] ${
                      verdict.allowed ? "text-muted" : "rounded-[2px] px-1.5 text-ink"
                    }`}
                    style={verdict.allowed ? undefined : { backgroundColor: accentWash }}
                  >
                    {verdict.allowed ? "icazə var" : "bloklanıb"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] break-all text-muted">
                  {verdict.rule === null ? (
                    "heç bir qayda uyğun gəlmədi — defolt olaraq icazə verilir"
                  ) : (
                    <>
                      qalib qayda: {verdict.rule.line}. sətir —{" "}
                      <span className="font-mono">
                        {verdict.rule.kind === "allow" ? "Allow" : "Disallow"}: {verdict.rule.path}
                      </span>
                    </>
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ToolPanel>
  );
}
