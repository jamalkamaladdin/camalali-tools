"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import {
  GRADE_NOTES,
  normalizeTargetUrl,
  type HeaderFinding,
  type HeaderReport,
} from "../lib/basliqlar";
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

const EXAMPLES = ["camalali.com", "github.com", "wikipedia.org"];

const VERDICT_LABELS = {
  good: "qurulub",
  weak: "zəif",
  missing: "yoxdur",
} as const;

type State =
  | { phase: "idle" }
  | { phase: "loading"; url: string }
  | { phase: "done"; report: HeaderReport }
  | { phase: "error"; message: string };

export function BasliqlarTool() {
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
      const response = await fetch(`/api/alet/basliqlar?unvan=${encodeURIComponent(target.url)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: HeaderReport; message?: string };
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
        Yazdığın ünvana sorğunu sənin brauzerin yox, bu saytın serveri göndərir: bir HEAD sorğusu,
        yalnız başlıqları oxumaq üçün. Səhifənin gövdəsi yüklənmir. Daxili şəbəkə ünvanları
        (localhost, 10.x, 192.168.x) və 80/443-dən başqa portlar rədd edilir.
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
              htmlFor="basliqlar-url"
              className="min-w-56 flex-1"
              note="Sxem yazılmasa https götürülür. Yönləndirmə izlənmir: hara yönləndirdiyi göstərilir."
            >
              <ToolInput
                id="basliqlar-url"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="https://example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Yoxlanır…" : "Yoxla"}
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
          <span className="font-mono">{state.url}</span> sorğulanır…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: HeaderReport }) {
  const plain = report.all.map((entry) => `${entry.name}: ${entry.value}`).join("\n");

  return (
    <div className="space-y-5">
      {report.redirectedTo && (
        <ToolNote tone="accent" title={`Sayt ${report.status} yönləndirməsi qaytardı`}>
          Ünvan «{report.redirectedTo}» ünvanına yönləndirir. Aşağıdakı bal yönləndirmə cavabının
          başlıqlarına aiddir: əsl səhifəni görmək üçün həmin ünvanı yoxla.
        </ToolNote>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <ToolStat label="Bal" value={`${report.grade} · ${report.score}/100`} tone="accent" />
        <ToolStat label="HTTP cavabı" value={String(report.status)} />
        <ToolStat label="Yoxlanıldı" value={formatAzStamp(new Date(report.checkedAt))} />
      </div>

      <ToolNote title={`${report.grade}: ${report.score} xal`}>{GRADE_NOTES[report.grade]}</ToolNote>

      <ToolResultPanel title="Başlıqlar" hint={`${report.findings.length} yoxlama`}>
        <div className="space-y-3 p-3">
          {report.findings.map((finding) => (
            <FindingRow key={finding.header} finding={finding} />
          ))}
        </div>
      </ToolResultPanel>

      {report.todo.length > 0 && (
        <ToolResultPanel title="Nə düzəltmək lazımdır" hint="itirilən xala görə sıralanıb">
          <ol className="list-decimal space-y-2 p-4 pl-8 text-sm/6">
            {report.todo.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </ToolResultPanel>
      )}

      {report.leaks.length > 0 && (
        <ToolNote tone="accent" title="Məlumat sızdıran başlıqlar">
          <ul className="space-y-1">
            {report.leaks.map((leak) => (
              <li key={leak.name}>
                <span className="font-mono text-xs">
                  {leak.name}: {leak.value}
                </span>{" "}
                , {leak.note}
              </li>
            ))}
          </ul>
        </ToolNote>
      )}

      <ToolAccordion>
        <ToolAccordionItem
          summary="Serverin göndərdiyi bütün başlıqlar"
          hint={`${report.all.length} ədəd`}
        >
          <div className="space-y-2">
            <CopyButton value={plain} label="başlıqları kopyala" />
            <ul className="space-y-1">
              {report.all.map((entry, index) => (
                <li key={`${entry.name}-${index}`} className="font-mono text-xs break-all">
                  <span className={entry.leaks ? "font-semibold text-ink" : "text-muted"}>
                    {entry.name}
                  </span>
                  : {entry.value}
                </li>
              ))}
            </ul>
          </div>
        </ToolAccordionItem>
      </ToolAccordion>
    </div>
  );
}

function FindingRow({ finding }: { finding: HeaderFinding }) {
  return (
    <div className="border-l-2 border-rule pl-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-mono text-xs font-semibold">{finding.header}</h3>
        <span className="font-ui text-[11px] text-muted">
          {VERDICT_LABELS[finding.verdict]} ·{" "}
          <span className="tabular-nums">
            {finding.points}/{finding.max}
          </span>{" "}
          xal
        </span>
      </div>
      <p className="mt-1 text-sm/6 text-muted">{finding.purpose}</p>
      <p className="mt-1 text-sm/6">{finding.note}</p>
      {finding.value !== null && (
        <p className="mt-1 font-mono text-[11px] break-all text-muted">{finding.value}</p>
      )}
    </div>
  );
}
