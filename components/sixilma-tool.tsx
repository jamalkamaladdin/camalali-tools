"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { normalizeTargetUrl } from "../lib/safe-url";
import type { CompressionLiveReport, EncodingVerdict } from "../lib/sixilma";
import {
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

type State =
  | { phase: "idle" }
  | { phase: "loading"; host: string }
  | { phase: "done"; report: CompressionLiveReport }
  | { phase: "error"; message: string };

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "ölçülmədi";
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

export function SixilmaTool() {
  const [input, setInput] = useState("");
  const [state, setState] = useState<State>({ phase: "idle" });

  async function run(raw: string) {
    const target = normalizeTargetUrl(raw);
    if (!target.ok) {
      setState({ phase: "error", message: target.error });
      return;
    }

    setState({ phase: "loading", host: target.hostname });
    try {
      const response = await fetch(`/api/alet/sixilma?unvan=${encodeURIComponent(target.url)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: CompressionLiveReport; message?: string };
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
      <ToolNote tone="accent" title="Bu alət dörd sorğu göndərir">
        Yazdığın ünvana sənin brauzerin yox, bu saytın serveri dörd ayrı GET sorğusu göndərir: hər
        dəfə fərqli <span className="font-mono text-xs">Accept-Encoding</span> ilə. Cavabın
        başlıqları oxunur, gövdəsi isə atılır.
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
            <ToolField label="Ünvan" htmlFor="sixilma-unvan" className="min-w-56 flex-1">
              <ToolInput
                id="sixilma-unvan"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="example.com"
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
          <span className="font-mono">{state.host}</span> dörd dəfə sorğulanır…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function VerdictRow({ verdict }: { verdict: EncodingVerdict }) {
  return (
    <div className="border-l-2 border-l-rule pl-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-mono text-sm font-semibold">{verdict.label}</span>
        <span className="text-[11px] text-muted">
          istənilən: <span className="font-mono">{verdict.requestedAcceptEncoding}</span>
        </span>
      </div>
      <p className="mt-1 text-[11px] text-muted">
        server seçdi:{" "}
        <span className="font-mono">
          {verdict.serverUsed ?? "(Content-Encoding yoxdur)"}
        </span>
        {verdict.matched ? " · istənilən kimi" : " · fərqli"}
      </p>
      <p className="mt-0.5 text-sm/6">
        {formatBytes(verdict.byteSize)}
        {verdict.savingsPercent !== null && `, sıxılmasızdan ${verdict.savingsPercent}% kiçik`}
      </p>
    </div>
  );
}

function Report({ report }: { report: CompressionLiveReport }) {
  if (!report.result.ok) {
    return (
      <ToolNote tone="accent" title="Alınmadı">
        {report.result.error}
      </ToolNote>
    );
  }

  const { verdicts, bestEncoding, anyCompressionOffered, identityByteSize } = report.result.report;

  return (
    <div className="space-y-5">
      <ToolResultPanel
        title="Nəticə"
        hint={anyCompressionOffered ? "sıxılma aktivdir" : "sıxılma yoxdur"}
      >
        <div className="@container p-4">
          <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-3">
            <ToolStat
              label="Ən yaxşı kodlaşdırma"
              value={bestEncoding ?? "yoxdur"}
              tone={bestEncoding ? "default" : "warning"}
            />
            <ToolStat label="Sıxılmasız ölçü" value={formatBytes(identityByteSize)} />
            <ToolStat
              label="Sıxılma aktivdirmi?"
              value={anyCompressionOffered ? "bəli" : "xeyr"}
              tone={anyCompressionOffered ? "default" : "warning"}
            />
          </div>
        </div>
      </ToolResultPanel>

      {!anyCompressionOffered && (
        <ToolNote tone="accent" title="Sıxılma tapılmadı">
          Nə gzip, nə Brotli, nə də Zstandard istəyinə cavab olaraq server sıxılmış nüsxə göndərmədi.
          Mətn əsaslı cavablar adətən sıxılanda xeyli kiçilir: bu boşluq real ötürmə vaxtı itkisidir.
        </ToolNote>
      )}

      <ToolPanel>
        <ToolPanelHeader title="Kodlaşdırma üzrə nəticələr" hint={`${verdicts.length} sorğu`} />
        <div className="space-y-3 p-3">
          {verdicts.map((verdict) => (
            <VerdictRow key={verdict.encoding} verdict={verdict} />
          ))}
        </div>
      </ToolPanel>

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">{report.url}</span> · {formatAzStamp(new Date(report.checkedAt))}
      </p>
    </div>
  );
}
