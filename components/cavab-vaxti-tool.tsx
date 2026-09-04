"use client";

import { useState, type FormEvent } from "react";
import { formatAzStamp } from "../shared/az-date";
import { normalizeTargetUrl } from "../lib/safe-url";
import {
  PHASE_ORDER,
  type CavabVaxtiReport,
  type PhaseName,
} from "../lib/cavab-vaxti";
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

/* Fixed neutral fills, darkest last, so a greyscale printout still tells the
   four segments apart by shade alone. The heaviest phase is redrawn in the
   accent so the bar and the diagnosis sentence point at the same thing. */
const PHASE_FILL: Record<PhaseName, string> = {
  dns: "var(--color-fill-2)",
  tcp: "var(--color-fill-3)",
  tls: "var(--color-fill-4)",
  ttfb: "var(--color-muted-2)",
};

type State =
  | { phase: "idle" }
  | { phase: "loading"; host: string }
  | { phase: "done"; report: CavabVaxtiReport }
  | { phase: "error"; message: string };

function formatMs(ms: number): string {
  if (Math.abs(ms) < 10) return `${ms.toFixed(1)} ms`;
  return `${Math.round(ms)} ms`;
}

export function CavabVaxtiTool() {
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
      const response = await fetch(`/api/alet/cavab-vaxti?unvan=${encodeURIComponent(target.url)}`);
      const body: unknown = await response.json();
      const payload = body as { ok?: boolean; data?: CavabVaxtiReport; message?: string };
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
      <ToolNote tone="accent" title="Bu alət üç bağlantı açır">
        Yazdığın ünvana sənin brauzerin yox, bu saytın serveri qoşulur — ardıcıl üç dəfə, hər dəfə
        yeni bir soketlə. Cavabın gövdəsi heç vaxt oxunmur, yalnız hansı anda nə baş verdiyi
        ölçülür.
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
            <ToolField label="Ünvan" htmlFor="cavab-vaxti-unvan" className="min-w-56 flex-1">
              <ToolInput
                id="cavab-vaxti-unvan"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="example.com"
                spellCheck={false}
                autoComplete="off"
                inputMode="url"
              />
            </ToolField>
            <ToolButton type="submit" disabled={busy} className="h-9">
              {busy ? "Ölçülür…" : "Ölç"}
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
          <span className="font-mono">{state.host}</span> üç dəfə ölçülür…
        </p>
      )}

      {state.phase === "done" && <Report report={state.report} />}
    </div>
  );
}

function PhaseBar({ report }: { report: CavabVaxtiReport }) {
  const { shares } = report.breakdown;
  const segments = shares.reduce<Array<(typeof shares)[number] & { x: number; width: number }>>(
    (acc, entry) => {
      const previous = acc[acc.length - 1];
      const x = previous ? previous.x + previous.width : 0;
      const width = entry.share * 100;
      acc.push({ ...entry, x, width });
      return acc;
    },
    [],
  );

  return (
    <div>
      <svg viewBox="0 0 100 14" className="h-4 w-full overflow-hidden rounded-sm" preserveAspectRatio="none">
        {segments.map((seg) =>
          seg.width > 0 ? (
            <rect
              key={seg.phase}
              x={seg.x}
              y={0}
              width={seg.width}
              height={14}
              fill={seg.phase === report.breakdown.heaviest ? "var(--color-accent)" : PHASE_FILL[seg.phase]}
            />
          ) : null,
        )}
      </svg>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 font-ui text-[11px] text-muted sm:grid-cols-4">
        {PHASE_ORDER.map((phase) => {
          const entry = shares.find((share) => share.phase === phase);
          if (!entry) return null;
          return (
            <li key={phase} className="flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-2 shrink-0 rounded-[2px]"
                style={{
                  backgroundColor:
                    phase === report.breakdown.heaviest ? "var(--color-accent)" : PHASE_FILL[phase],
                }}
              />
              <span>
                {entry.label}: {formatMs(entry.ms)} ({Math.round(entry.share * 100)}%)
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Report({ report }: { report: CavabVaxtiReport }) {
  const { median } = report.breakdown;

  return (
    <div className="space-y-5">
      <ToolResultPanel title="Nəticə" hint={formatMs(median.totalMs)}>
        <div className="space-y-4 p-4">
          <div className="@container">
            <div className="grid gap-3 @min-[30rem]:grid-cols-2 @min-[52rem]:grid-cols-4">
              <ToolStat label="DNS həlli" value={formatMs(median.dnsMs)} />
              <ToolStat label="TCP əlsıxması" value={formatMs(median.tcpMs)} />
              <ToolStat
                label="TLS əlsıxması"
                value={report.secure ? formatMs(median.tlsMs) : "—"}
                note={report.secure ? undefined : "http — şifrələmə yoxdur"}
              />
              <ToolStat label="İlk baytadək (TTFB)" value={formatMs(median.ttfbMs)} />
            </div>
          </div>

          <PhaseBar report={report} />
        </div>
      </ToolResultPanel>

      <ToolNote tone="accent" title="Diaqnoz">
        {report.breakdown.diagnosis}
      </ToolNote>

      <p className="text-[11px] break-all text-muted">
        <span className="font-mono">
          {report.address} ({report.addressFamily === 6 ? "IPv6" : "IPv4"})
        </span>{" "}
        · {formatAzStamp(new Date(report.checkedAt))}
      </p>
    </div>
  );
}
