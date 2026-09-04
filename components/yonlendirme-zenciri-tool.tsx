"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { CopyButton } from "../shared/copy-button";
import { normalizeTargetUrl } from "../lib/safe-url";
import {
  countRedirects,
  type ChainIssue,
  type ChainReport,
  type ChainStep,
  type HopKind,
} from "../lib/yonlendirme-zenciri";
import {
  accentWash,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
  ToolStat,
} from "./ui";

const EXAMPLES = ["camalali.com", "http://github.com", "bit.ly"];

/*
 * Colour is never the only signal here. Each step prints its status number and
 * the same verdict in words, and the rail down the left only ever adds emphasis
 * to something the row already says - which is what keeps the chain readable in
 * greyscale and to a reader who does not separate the accent from the rule.
 */
const KIND_WORDS: Record<HopKind, string> = {
  daimi: "daimi",
  muveqqeti: "müvəqqəti",
  son: "son",
  xeta: "xəta",
};

/** The rail is spent on the two kinds a visitor has to act on. */
function railFor(kind: HopKind): string {
  return kind === "xeta" || kind === "muveqqeti" ? "border-l-accent" : "border-l-rule";
}

type State =
  | { phase: "idle" }
  | { phase: "loading"; url: string }
  | { phase: "done"; report: ChainReport }
  | { phase: "error"; message: string };

export function YonlendirmeZenciriTool() {
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

    setState({ phase: "loading", url: target.url });
    try {
      const response = await fetch(
        `/api/alet/yonlendirme-zenciri?unvan=${encodeURIComponent(target.url)}`,
      );
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: ChainReport; message?: string };
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
        Yazdığın ünvanı sənin brauzerin yox, bu saytın serveri açır və zənciri addım-addım izləyir —
        ən çoxu 10 addım. Səhifələrin mətni oxunmur, yalnız status kodu və «Location» başlığı
        götürülür. Hər addım ayrıca yoxlanılır: zəncir daxili şəbəkə ünvanına (localhost, 10.x,
        192.168.x) çıxarsa orada dayandırılır.
      </ToolNote>

      <ToolPanel>
        <ToolPanelHeader
          title="Ünvan"
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
              label="Sayt ünvanı"
              htmlFor="zencir-url"
              className="min-w-56 flex-1"
              note="Sxem yazılmasa https götürülür. http:// yazsan, http-dən başlayan zənciri görərsən: köçürmə qaydalarını yoxlamağın ən dəqiq yolu budur."
            >
              <ToolInput
                id="zencir-url"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "İzlənir…" : "Zənciri izlə"}
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
          <span className="font-mono">{state.url}</span> izlənir…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: ChainReport }) {
  const redirects = countRedirects(report.steps);
  const plain = report.steps
    .map((step, index) => `${index + 1}. ${step.status} ${step.url}${step.location ? ` → ${step.location}` : ""}`)
    .join("\n");

  return (
    <div className="space-y-5">
      <div className="@container">
        <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
          <ToolStat label="Addım sayı" value={String(report.steps.length)} />
          <ToolStat
            label="Yönləndirmə"
            value={String(redirects)}
            tone={redirects >= 2 ? "warning" : "default"}
            note={redirects === 0 ? "birbaşa cavab" : undefined}
          />
          <ToolStat label="Son status" value={String(report.finalStatus)} tone="accent" />
          <ToolStat label="Yoxlanıldı" value={formatAzStamp(new Date(report.checkedAt))} />
        </div>
      </div>

      <ToolResultPanel
        title="Zəncir"
        hint={`${report.steps.length} addım`}
        action={<CopyButton value={plain} label="zənciri kopyala" />}
      >
        <ol className="space-y-3 p-3">
          {report.steps.map((step, index) => (
            <ChainRow key={`${step.url}-${index}`} step={step} index={index} />
          ))}
        </ol>
      </ToolResultPanel>

      <ToolResultPanel title="Son ünvan">
        <div className="p-3">
          <p className="font-mono text-sm break-all">{report.finalUrl}</p>
          <p className="mt-1 font-ui text-[11px] text-muted">
            <span className="font-mono tabular-nums">{report.finalStatus}</span> ·{" "}
            {report.steps[report.steps.length - 1]?.label ?? "cavab yoxdur"}
          </p>
        </div>
      </ToolResultPanel>

      <ToolResultPanel
        title="Problemlər"
        hint={report.issues.length === 0 ? "tapılmadı" : `${report.issues.length} bənd`}
      >
        <div className="space-y-3 p-3">
          {report.issues.length === 0 ? (
            <p className="text-sm/6 text-muted">
              Zəncirdə düzəliş tələb edən bir şey tapılmadı — nə dövrə, nə artıq addım, nə də sxem
              enişi var.
            </p>
          ) : (
            report.issues.map((issue, index) => <IssueRow key={index} issue={issue} />)
          )}
        </div>
      </ToolResultPanel>

      <ToolNote title="Alət nəyi görmür">
        Bu alət yalnız HTTP səviyyəsini oxuyur. Səhifənin içindəki{" "}
        <span className="font-mono text-xs">meta refresh</span> teqi və ya JavaScript ilə edilən{" "}
        <span className="font-mono text-xs">location.href</span> yönləndirməsi serverin cavabında
        görünmür — belə hallarda burada «200, son ünvan» yazılır, çünki serverin dediyi elə budur.
        Nəticə uydurulmur: brauzerdə köçürmə görürsənsə, amma zəncir 200 ilə bitirsə, səbəb məhz
        budur. Hər ikisi SEO baxımından 301-in əvəzi deyil.
      </ToolNote>
    </div>
  );
}

function ChainRow({ step, index }: { step: ChainStep; index: number }) {
  return (
    <li className={`border-l-2 pl-3 ${railFor(step.kind)}`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-ui text-[11px] tabular-nums text-muted">{index + 1}.</span>
        <span
          className={`font-mono text-xs font-semibold tabular-nums ${
            step.kind === "xeta" ? "rounded-[2px] px-1.5 text-ink" : ""
          }`}
          style={step.kind === "xeta" ? { backgroundColor: accentWash } : undefined}
        >
          {step.status}
        </span>
        <span className="font-ui text-[11px] text-muted">
          {KIND_WORDS[step.kind]} · {step.label}
        </span>
      </div>
      <p className="mt-1 font-mono text-sm break-all">{step.url}</p>
      {step.location !== null && (
        <p className="mt-1 font-mono text-[11px] break-all text-muted">→ {step.location}</p>
      )}
    </li>
  );
}

function IssueRow({ issue }: { issue: ChainIssue }) {
  return (
    <div
      className={`border-l-2 pl-3 ${issue.severity === "xeta" ? "border-l-accent" : "border-l-rule"}`}
    >
      <p className="font-ui text-[11px] text-muted">
        {issue.severity === "xeta" ? "xəta" : "xəbərdarlıq"}
        {issue.step !== null && ` · ${issue.step}. addım`}
      </p>
      <p className="mt-1 text-sm/6">{issue.message}</p>
    </div>
  );
}
