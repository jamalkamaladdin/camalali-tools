"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { normalizeTargetUrl } from "../lib/safe-url";
import type { TlsVersionReport, TlsVersionRow } from "../lib/tls-versiyalari";
import {
  accentWash,
  ToolButton,
  ToolField,
  ToolInput,
  ToolNote,
  ToolPanel,
  ToolPanelHeader,
  ToolResultPanel,
} from "./ui";

const EXAMPLES = ["camalali.com", "github.com", "wikipedia.org"];

const VERDICT_WORDS: Record<TlsVersionRow["verdict"], string> = {
  supported: "dəstəklənir",
  unsupported: "dəstəklənmir",
  unknown: "yoxlanıla bilmədi",
};

type State =
  | { phase: "idle" }
  | { phase: "loading"; host: string }
  | { phase: "done"; report: TlsVersionReport }
  | { phase: "error"; message: string };

export function TlsVersiyalariTool() {
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
      const response = await fetch(`/api/alet/tls-versiyalari?domen=${encodeURIComponent(target.hostname)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: TlsVersionReport; message?: string };
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
        Yazdığın domenin 443 portuna bu saytın serveri dörd ayrı TLS bağlantısı açır: hər dəfə
        yalnız bir versiya təklif edərək. Sənin brauzerin heç bir versiyanı sınamır.
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
            <ToolField label="Domen adı" htmlFor="tls-versiyalari-domen" className="min-w-56 flex-1">
              <ToolInput
                id="tls-versiyalari-domen"
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
        <p className="font-ui text-sm text-muted">«{state.host}» üçün dörd versiya ayrı-ayrı sınanır…</p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function Report({ report }: { report: TlsVersionReport }) {
  return (
    <div className="space-y-5">
      <ToolNote tone={report.hasRiskySupported ? "accent" : "info"} title="Nəticə">
        {report.verdict}
      </ToolNote>

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">
          {report.hostname} → {report.address}
        </span>{" "}
        · {formatAzStamp(new Date(report.checkedAt))}
      </p>

      <ToolResultPanel title="Versiyalar" hint={`${report.rows.length} sınaq`}>
        <div className="space-y-2 p-3">
          {report.rows.map((row) => (
            <div key={row.version} className={`border-l-2 pl-3 ${row.risky ? "border-l-accent" : "border-l-rule"}`}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-ui text-sm font-semibold">{row.label}</span>
                <span
                  className={`text-[11px] ${row.verdict === "supported" ? "rounded-[2px] px-1.5 text-ink" : "text-muted"}`}
                  style={row.verdict === "supported" ? { backgroundColor: accentWash } : undefined}
                >
                  {VERDICT_WORDS[row.verdict]}
                </span>
                {row.risky && <span className="text-[11px] text-muted">köhnə protokol</span>}
              </div>
              {row.cipher && <p className="mt-1 font-mono text-[11px] break-all text-muted">{row.cipher}</p>}
              {row.note && <p className="mt-1 text-[11px] text-muted">{row.note}</p>}
            </div>
          ))}
        </div>
      </ToolResultPanel>
    </div>
  );
}
